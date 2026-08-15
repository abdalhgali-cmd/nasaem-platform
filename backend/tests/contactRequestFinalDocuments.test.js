import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_FIXTURE = path.join(__dirname, "fixtures", "passport-mrz-sample.png");

// Own process (own fresh in-memory rate limiters), independent of every
// other test file — see contactRequests.test.js's budget comments. This
// file spends 1 of publicContactLimiter's 5 POST /contact-requests and 2 of
// request-code's 5/15min/IP (one customer login for the request's real
// owner, reused across every test that needs it; one for a stranger phone
// in the ownership-check test). File uploads go through authenticated
// staff routes (no limiter) or the customer download route (no limiter).
async function loginAsCustomer(phone) {
  const codeRes = await request(app).post("/api/customer-auth/request-code").send({ phone });
  assert.equal(codeRes.status, 200);

  const agent = request.agent(app);
  const verifyRes = await agent.post("/api/customer-auth/verify-code").send({
    loginCodeId: codeRes.body.data.loginCodeId,
    code: codeRes.body.data.debugCode,
  });
  assert.equal(verifyRes.status, 200);

  return agent;
}

describe("contact request final documents (staff-authored deliverables)", () => {
  let adminAgent;
  let requestId;
  let phone;
  let customerAgent;
  let passportDocumentId;

  before(async () => {
    adminAgent = await loginAsSuperAdmin();

    phone = `09${uniqueSuffix().slice(-6)}05`;
    const createRes = await request(app).post("/api/contact-requests").send({
      name: "Final Documents Owner",
      phone,
      service: "طيران",
      details: { من: "الخرطوم", إلى: "جدة" },
    });
    assert.equal(createRes.status, 201);
    requestId = createRes.body.data.id;

    customerAgent = await loginAsCustomer(phone);

    // A real passport-image upload gives us a non-FINAL document id to
    // prove the final-documents download route rejects it.
    const uploadRes = await request(app)
      .post(`/api/contact-requests/${requestId}/passport-image`)
      .attach("images", IMAGE_FIXTURE);
    assert.equal(uploadRes.status, 200);
    const docsRes = await adminAgent.get(`/api/contact-requests/${requestId}/documents`);
    passportDocumentId = docsRes.body.data[0].id;
  });

  test("EMPLOYEE/ADMIN/SUPER_ADMIN can upload; ACCOUNTANT and unauthenticated cannot", async () => {
    const unauthRes = await request(app)
      .post(`/api/contact-requests/${requestId}/final-documents`)
      .attach("files", IMAGE_FIXTURE);
    assert.equal(unauthRes.status, 401);

    const accountantEmail = `final-doc-accountant-${uniqueSuffix()}@nasaem-platform.local`;
    const accountantPassword = "TestPass@12345";
    const createRes = await adminAgent.post("/api/users").send({
      fullName: "Final Doc Accountant",
      email: accountantEmail,
      password: accountantPassword,
      role: "ACCOUNTANT",
    });
    assert.equal(createRes.status, 201);
    const accountantAgent = request.agent(app);
    await accountantAgent.post("/api/auth/login").send({ email: accountantEmail, password: accountantPassword });
    const accountantRes = await accountantAgent
      .post(`/api/contact-requests/${requestId}/final-documents`)
      .attach("files", IMAGE_FIXTURE);
    assert.equal(accountantRes.status, 403);

    const zeroFilesRes = await adminAgent.post(`/api/contact-requests/${requestId}/final-documents`);
    assert.equal(zeroFilesRes.status, 400);

    const unknownIdRes = await adminAgent
      .post("/api/contact-requests/does-not-exist/final-documents")
      .attach("files", IMAGE_FIXTURE);
    assert.equal(unknownIdRes.status, 404);
  });

  test("staff upload of 2 files creates 2 FINAL/ACCEPTED documents with real filenames", async () => {
    const uploadRes = await adminAgent
      .post(`/api/contact-requests/${requestId}/final-documents`)
      .attach("files", IMAGE_FIXTURE, "visa-approval.png")
      .attach("files", IMAGE_FIXTURE, "e-ticket.png");
    assert.equal(uploadRes.status, 201);

    const listRes = await adminAgent.get("/api/contact-requests?limit=100");
    const row = listRes.body.data.find((r) => r.id === requestId);
    const finalDocs = row.documents.filter((d) => d.type === "FINAL");
    assert.equal(finalDocs.length, 2);
    assert.ok(finalDocs.every((d) => d.status === "ACCEPTED"));
    assert.deepEqual(finalDocs.map((d) => d.fileName).sort(), ["e-ticket.png", "visa-approval.png"]);
  });

  test("customer /mine shows finalDocuments separately, excluded from documents", async () => {
    const mineRes = await customerAgent.get("/api/contact-requests/mine");
    const row = mineRes.body.data.find((r) => r.id === requestId);

    assert.equal(row.finalDocuments.length, 2);
    assert.ok(row.finalDocuments.every((d) => d.fileName));
    assert.ok(row.documents.every((d) => d.type !== "FINAL"));
    // The passport-image uploaded in before() is still there, untouched.
    assert.ok(row.documents.some((d) => d.type === "PASSPORT"));
  });

  test("customer can download their own FINAL document; not a non-FINAL one", async () => {
    const mineRes = await customerAgent.get("/api/contact-requests/mine");
    const finalDocId = mineRes.body.data.find((r) => r.id === requestId).finalDocuments[0].id;

    const downloadRes = await customerAgent.get(`/api/contact-requests/${requestId}/final-documents/${finalDocId}/file`);
    assert.equal(downloadRes.status, 200);
    assert.ok(downloadRes.headers["content-disposition"].includes("attachment"));

    const wrongTypeRes = await customerAgent.get(
      `/api/contact-requests/${requestId}/final-documents/${passportDocumentId}/file`
    );
    assert.equal(wrongTypeRes.status, 404);
  });

  test("a different customer's session gets 403; unauthenticated gets 401", async () => {
    const strangerPhone = `09${uniqueSuffix().slice(-6)}15`;
    const strangerAgent = await loginAsCustomer(strangerPhone);

    const listRes = await adminAgent.get("/api/contact-requests?limit=100");
    const finalDocId = listRes.body.data.find((r) => r.id === requestId).documents.find((d) => d.type === "FINAL").id;

    const forbiddenRes = await strangerAgent.get(`/api/contact-requests/${requestId}/final-documents/${finalDocId}/file`);
    assert.equal(forbiddenRes.status, 403);

    const unauthRes = await request(app).get(`/api/contact-requests/${requestId}/final-documents/${finalDocId}/file`);
    assert.equal(unauthRes.status, 401);
  });

  test("staff cannot review (accept/reject) a FINAL document", async () => {
    const listRes = await adminAgent.get("/api/contact-requests?limit=100");
    const finalDocId = listRes.body.data.find((r) => r.id === requestId).documents.find((d) => d.type === "FINAL").id;

    const res = await adminAgent
      .patch(`/api/contact-requests/${requestId}/documents/${finalDocId}/status`)
      .send({ status: "REJECTED", rejectionReason: "x" });
    assert.equal(res.status, 400);
  });
});
