import "./env.js";
import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import { app, request, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { normalizePhone } from "../src/utils/phone.js";
import { signTrackingToken } from "../src/utils/jwt.js";
import { getSystemActorId } from "../src/utils/systemActor.js";
import { publicOrganizationId } from "../src/utils/publicOrganization.js";

// Phone-OTP tracking proves possession of a phone number, nothing more. It
// must only ever reach requests of the public organization, whatever another
// organization stored under the same number, and whatever organization id a
// client puts in the request.
describe("guest tracking is scoped to the public organization", () => {
  const suffix = uniqueSuffix();
  const localPhone = `0961${suffix}`;
  const phone = normalizePhone(localPhone);
  let otherOrg;
  let publicRequest;
  let otherRequest;
  let otherDocument;
  let otherDeliverable;
  let auth;

  before(async () => {
    otherOrg = await prisma.organization.create({
      data: { slug: `tracking-other-${suffix}`, name: `Tracking Other ${suffix}` },
    });
    publicRequest = await prisma.contactRequest.create({
      data: { name: "Public Guest", phone: localPhone, phoneNormalized: phone, message: "طلب عام" },
    });
    otherRequest = await prisma.contactRequest.create({
      data: {
        organizationId: otherOrg.id,
        name: "Other Org Customer",
        phone: localPhone,
        phoneNormalized: phone,
        message: "طلب منظمة أخرى",
        status: "CONTACTED",
      },
    });
    otherDocument = await prisma.contactRequestDocument.create({
      data: {
        contactRequestId: otherRequest.id,
        label: "مستند منظمة أخرى",
        fileName: "other.png",
        storagePath: "contact-request-documents/tracking-other.png",
        mimeType: "image/png",
        sizeBytes: 4,
        status: "ACCEPTED",
      },
    });
    otherDeliverable = await prisma.contactRequestDeliverable
      .create({
        data: {
          contactRequestId: otherRequest.id,
          label: "تسليم منظمة أخرى",
          fileName: "deliverable.pdf",
          storagePath: "contact-request-deliverables/tracking-other.pdf",
          mimeType: "application/pdf",
          sizeBytes: 4,
          uploadedByUserId: await getSystemActorId(),
        },
      });
    auth = { Authorization: `Bearer ${signTrackingToken(phone)}` };
  });

  test("the default public organization is the existing default org", () => {
    assert.equal(publicOrganizationId(), process.env.PUBLIC_ORGANIZATION_ID || "org_nasaem_default");
  });

  test("the request list excludes the other organization's request with the same phone", async () => {
    const res = await request(app).get("/api/tracking/requests").set(auth);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.data.map((r) => r.id);
    assert.ok(ids.includes(publicRequest.id), "the public request is visible");
    assert.ok(!ids.includes(otherRequest.id), "the other organization's request must not be visible");
  });

  test("a client-supplied organization id is ignored (query, header and body)", async () => {
    const res = await request(app)
      .get(`/api/tracking/requests?organizationId=${otherOrg.id}`)
      .set(auth)
      .set("X-Organization-Id", otherOrg.id);
    assert.equal(res.status, 200);
    const ids = res.body.data.map((r) => r.id);
    assert.ok(!ids.includes(otherRequest.id));

    const mark = await request(app)
      .post(`/api/tracking/requests/${otherRequest.id}/mark-transfer-sent`)
      .set(auth)
      .send({ organizationId: otherOrg.id });
    assert.equal(mark.status, 404, JSON.stringify(mark.body));
  });

  test("actions on the other organization's request return 404 and change nothing", async () => {
    const otherBefore = await prisma.contactRequest.findUnique({ where: { id: otherRequest.id } });
    const attempts = [
      request(app).post(`/api/tracking/requests/${otherRequest.id}/mark-transfer-sent`).set(auth),
      request(app).post(`/api/tracking/requests/${otherRequest.id}/invoice/approve`).set(auth),
      request(app).post(`/api/tracking/requests/${otherRequest.id}/invoice/reject`).set(auth),
      request(app).post(`/api/tracking/requests/${otherRequest.id}/offers/nonexistent/select`).set(auth),
      request(app).get(`/api/tracking/requests/${otherRequest.id}/documents/${otherDocument.id}/file`).set(auth),
      request(app)
        .post(`/api/tracking/requests/${otherRequest.id}/documents`)
        .set(auth)
        .field("label", "جواز السفر")
        .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: "x.png", contentType: "image/png" }),
      request(app)
        .post(`/api/tracking/requests/${otherRequest.id}/egypt-travel-plan`)
        .set(auth)
        .field("entryMode", "AIR").field("bookingStatus", "NEEDS_NASAEM").field("entryDate", "2030-01-15"),
    ];
    attempts.push(request(app).get(`/api/tracking/requests/${otherRequest.id}/deliverables/${otherDeliverable.id}/file`).set(auth));
    for (const res of await Promise.all(attempts)) {
      // 404 (not yours) — or 403 when a feature flag is off; never success.
      assert.ok([403, 404].includes(res.status), `${res.req?.method} ${res.req?.path} → ${res.status} ${JSON.stringify(res.body)}`);
      assert.notEqual(res.body?.success, true);
    }
    const after = await prisma.contactRequest.findUnique({ where: { id: otherRequest.id } });
    assert.equal(after.status, "CONTACTED");
    assert.equal(after.paymentStatus, otherBefore.paymentStatus, "payment state unchanged");
    const docs = await prisma.contactRequestDocument.count({ where: { contactRequestId: otherRequest.id } });
    assert.equal(docs, 1, "no document was attached to the other organization's request");
  });

  test("reusable documents never include the other organization's documents", async () => {
    const res = await request(app).get("/api/tracking/reusable-documents").set(auth);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(!res.body.data.some((d) => d.label === "مستند منظمة أخرى"));
  });

  test("an unauthenticated or forged token reaches nothing", async () => {
    assert.equal((await request(app).get("/api/tracking/requests")).status, 401);
    const forged = await request(app).get("/api/tracking/requests").set({ Authorization: "Bearer not-a-token" });
    assert.equal(forged.status, 401);
  });
});
