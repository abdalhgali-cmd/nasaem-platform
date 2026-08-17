import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// Only two of this file's tests need a fresh ContactRequest of their own —
// creating one goes through the public, rate-limited (5/window) POST
// /api/contact-requests endpoint, which contactRequests.test.js's own
// suite already budgets tightly against in a single process. Everything
// else here reuses one request via `before()`.
async function submitContactRequest(phone) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Document Test User",
      phone,
      message: "طلب تأشيرة عمل، سيتم رفع جواز السفر",
    });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

async function loginTrackingAgent(phone) {
  const agent = request.agent(app);
  const requestRes = await request(app).post("/api/tracking/request-code").send({ phone });
  const verifyRes = await agent
    .post("/api/tracking/verify-code")
    .send({ phone, code: requestRes.body.debugCode });
  assert.equal(verifyRes.status, 200, JSON.stringify(verifyRes.body));
  return agent;
}

function attachPng(req) {
  return req.attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
    filename: "passport.png",
    contentType: "image/png",
  });
}

describe("contact request documents (customer upload + staff review)", () => {
  let superAdminAgent;
  let employeeAgent;
  const employeePassword = "TestPass@12345";
  let phone;
  let contactRequestId;
  let customerAgent;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();

    const employeeEmail = `doc-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const createEmployeeRes = await superAdminAgent.post("/api/users").send({
      fullName: "Document Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(createEmployeeRes.status, 201);

    employeeAgent = request.agent(app);
    const employeeLoginRes = await employeeAgent
      .post("/api/auth/login")
      .send({ email: employeeEmail, password: employeePassword });
    assert.equal(employeeLoginRes.status, 200);

    phone = `096${uniqueSuffix()}`;
    contactRequestId = await submitContactRequest(phone);
    customerAgent = await loginTrackingAgent(phone);
  });

  test("rejects an unsupported file type", async () => {
    const res = await customerAgent
      .post(`/api/tracking/requests/${contactRequestId}/documents`)
      .field("label", "جواز السفر")
      .attach("file", Buffer.from("not a real file"), {
        filename: "malware.exe",
        contentType: "application/x-msdownload",
      });

    assert.equal(res.status, 400);
  });

  test("rejects an upload with no label", async () => {
    const res = await attachPng(
      customerAgent.post(`/api/tracking/requests/${contactRequestId}/documents`)
    );

    assert.equal(res.status, 400);
  });

  test("rejects an unauthenticated upload", async () => {
    const res = await attachPng(
      request(app).post(`/api/tracking/requests/${contactRequestId}/documents`).field("label", "جواز السفر")
    );

    assert.equal(res.status, 401);
  });

  test("full flow: customer uploads, staff downloads + rejects, customer re-uploads, staff accepts", async () => {
    const uploadRes = await attachPng(
      customerAgent
        .post(`/api/tracking/requests/${contactRequestId}/documents`)
        .field("label", "جواز السفر")
    );
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));
    assert.equal(uploadRes.body.data.status, "PENDING");
    assert.equal(uploadRes.body.data.label, "جواز السفر");
    const documentId = uploadRes.body.data.id;

    // The customer can view their own upload.
    const ownFileRes = await customerAgent.get(
      `/api/tracking/requests/${contactRequestId}/documents/${documentId}/file`
    );
    assert.equal(ownFileRes.status, 200);
    assert.equal(ownFileRes.headers["content-type"], "image/png");

    // Staff can list it (via the main contact-requests list) and download it.
    const listRes = await superAdminAgent.get("/api/contact-requests?limit=50");
    const found = listRes.body.data.find((r) => r.id === contactRequestId);
    assert.ok(found, "expected the contact request in the staff list");
    assert.equal(found.documents.length, 1);
    assert.equal(found.documents[0].status, "PENDING");

    const staffFileRes = await superAdminAgent.get(
      `/api/contact-requests/${contactRequestId}/documents/${documentId}/file`
    );
    assert.equal(staffFileRes.status, 200);
    assert.equal(staffFileRes.headers["content-type"], "image/png");

    // Rejecting without a reason is refused — the customer needs to know why.
    const rejectNoReasonRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
      .send({ status: "REJECTED" });
    assert.equal(rejectNoReasonRes.status, 400);

    const rejectRes = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${documentId}/status`)
      .send({ status: "REJECTED", reviewNote: "الصورة غير واضحة، يرجى إعادة الرفع" });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.data.status, "REJECTED");
    assert.equal(rejectRes.body.data.reviewNote, "الصورة غير واضحة، يرجى إعادة الرفع");

    // The customer sees the rejection and re-uploads (a brand new row —
    // the original rejected one is kept as history, not overwritten).
    const trackedRes = await customerAgent.get("/api/tracking/requests");
    const trackedRequest = trackedRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(trackedRequest.documents.length, 1);
    assert.equal(trackedRequest.documents[0].status, "REJECTED");
    assert.equal(trackedRequest.documents[0].reviewNote, "الصورة غير واضحة، يرجى إعادة الرفع");

    const reuploadRes = await attachPng(
      customerAgent
        .post(`/api/tracking/requests/${contactRequestId}/documents`)
        .field("label", "جواز السفر")
    );
    assert.equal(reuploadRes.status, 201);
    const secondDocumentId = reuploadRes.body.data.id;
    assert.notEqual(secondDocumentId, documentId);

    const acceptRes = await employeeAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/${secondDocumentId}/status`)
      .send({ status: "ACCEPTED" });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.data.status, "ACCEPTED");

    const finalListRes = await superAdminAgent.get("/api/contact-requests?limit=50");
    const finalFound = finalListRes.body.data.find((r) => r.id === contactRequestId);
    assert.equal(finalFound.documents.length, 2, "both the rejected and the re-uploaded copy should exist");
  });

  test("a customer can't act on another customer's documents", async () => {
    const otherPhone = `0961${uniqueSuffix()}`;
    const otherAgent = await loginTrackingAgent(otherPhone);

    const uploadRes = await attachPng(
      otherAgent
        .post(`/api/tracking/requests/${contactRequestId}/documents`)
        .field("label", "جواز السفر")
    );
    assert.equal(uploadRes.status, 404);
  });

  test("reviewing a nonexistent document returns 404", async () => {
    const res = await superAdminAgent
      .patch(`/api/contact-requests/${contactRequestId}/documents/does-not-exist/status`)
      .send({ status: "ACCEPTED" });
    assert.equal(res.status, 404);
  });
});
