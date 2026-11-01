import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { testPhone } from "./helpers/workflow.js";

// Staff see the Umrah and Egypt security-approval requests on their own
// (serviceKind filter on the request list, matching deriveServiceKind), and
// the payment-review queue links each request to its transfer receipt.

let admin;
const ORG = "org_nasaem_default";

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
});

async function requestFor(data) {
  return prisma.contactRequest.create({
    data: { name: `TEST-WF طابور ${uniqueSuffix()}`, phone: testPhone(), message: "TEST-WF", organizationId: ORG, ...data },
  });
}

describe("staff service queues", () => {
  test("?serviceKind=UMRAH / EGYPT_CLEARANCE return only those requests", async () => {
    const umrahPackage = await prisma.service.findUnique({ where: { code: "SVC-UMRAH-VISA" } });
    const umrahVisa = await prisma.visaType.findUnique({ where: { code: "VISA-UMRAH" } });
    const egypt = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE" } });
    const egyptAir = await prisma.visaType.findUnique({ where: { code: "VISA-EGYPT-CLEARANCE-AIR" } });
    const family = await prisma.visaType.findUnique({ where: { code: "VISA-FAMILY-VISIT" } });
    const flight = await prisma.service.findFirst({ where: { category: "flight" } });

    const umrahByPackage = await requestFor({ serviceId: umrahPackage.id, service: umrahPackage.name });
    const umrahByVisa = await requestFor({ visaTypeId: umrahVisa.id, serviceId: umrahVisa.serviceId });
    const egyptOriginal = await requestFor({ visaTypeId: egypt.id, serviceId: egypt.serviceId });
    const egyptVariant = egyptAir ? await requestFor({ visaTypeId: egyptAir.id }) : null;
    const other = await requestFor({ visaTypeId: family.id, serviceId: family.serviceId });
    const flightRequest = flight ? await requestFor({ serviceId: flight.id }) : null;

    const ids = async (kind) => {
      const res = await admin.get(`/api/contact-requests?limit=100&serviceKind=${kind}`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.body.data.every((row) => row.progress.serviceKind === kind), `${kind}: every row is that kind`);
      // Only Umrah rows carry the staff next step (umrah-staff-queue.js).
      assert.ok(res.body.data.every((row) => (kind === "UMRAH" ? typeof row.umrahQueue?.nextAction === "string" && Number.isInteger(row.umrahQueue.rank) : row.umrahQueue === undefined)), `${kind}: umrahQueue`);
      return new Set(res.body.data.map((row) => row.id));
    };

    const umrah = await ids("UMRAH");
    assert.ok(umrah.has(umrahByPackage.id) && umrah.has(umrahByVisa.id));
    assert.ok(!umrah.has(egyptOriginal.id) && !umrah.has(other.id));

    const clearance = await ids("EGYPT_CLEARANCE");
    assert.ok(clearance.has(egyptOriginal.id));
    if (egyptVariant) assert.ok(clearance.has(egyptVariant.id));
    assert.ok(!clearance.has(umrahByPackage.id) && !clearance.has(other.id));
    if (flightRequest) assert.ok(!clearance.has(flightRequest.id) && !umrah.has(flightRequest.id));

    const searched = await admin.get(`/api/contact-requests?limit=100&serviceKind=UMRAH&search=${encodeURIComponent(umrahByVisa.name)}`);
    assert.deepEqual(searched.body.data.map((row) => row.id), [umrahByVisa.id], "combines with the search");

    const unknown = await admin.get("/api/contact-requests?limit=5&serviceKind=NOPE");
    assert.equal(unknown.status, 200, "an unknown kind is ignored, not an error");
  });

  test("payment review queue links the latest transfer receipt", async () => {
    const request = await requestFor({ paymentStatus: "UNDER_REVIEW" });
    const old = await prisma.contactRequestDocument.create({ data: { contactRequestId: request.id, label: "إشعار الدفع", classification: "FINANCIAL_DOCUMENT", fileName: "old.pdf", storagePath: "contact-request-documents/old.pdf", mimeType: "application/pdf", sizeBytes: 10, createdAt: new Date(Date.now() - 60_000) } });
    const latest = await prisma.contactRequestDocument.create({ data: { contactRequestId: request.id, label: "إشعار الدفع", classification: "FINANCIAL_DOCUMENT", fileName: "new.pdf", storagePath: "contact-request-documents/new.pdf", mimeType: "application/pdf", sizeBytes: 10 } });
    const res = await admin.get("/api/dashboard/operations");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const item = res.body.data.items.find((row) => row.source === "contact_request" && row.id === request.id);
    assert.ok(item, "the request is in the operations feed");
    assert.equal(item.receiptDocumentId, latest.id);
    assert.notEqual(item.receiptDocumentId, old.id);
  });
});
