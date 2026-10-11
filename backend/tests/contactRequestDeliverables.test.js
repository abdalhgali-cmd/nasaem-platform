import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix, quoteVersion } from "./helpers/api.js";

// Only one fresh ContactRequest is created in this whole file — the public
// POST /api/contact-requests endpoint enforces a hard 5-per-window rate
// limit shared across this file's process (see contactRequests.test.js and
// the other contactRequest*.test.js files, which budget the same way).
async function submitContactRequest(phone) {
  const res = await request(app)
    .post("/api/contact-requests")
    .send({
      name: "Deliverable Test User",
      phone,
      message: "طلب تأشيرة، بانتظار استلام الملف النهائي",
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

function attachPdf(req) {
  return req.attach("file", Buffer.from("%PDF-1.4 fake pdf bytes"), {
    filename: "visa.pdf",
    contentType: "application/pdf",
  });
}

describe("contact request deliverables (staff delivery + customer download)", () => {
  let superAdminAgent;
  let phone;
  let contactRequestId;
  let customerAgent;

  before(async () => {
    superAdminAgent = await loginAsSuperAdmin();
    phone = `0931${uniqueSuffix()}`;
    contactRequestId = await submitContactRequest(phone);
    customerAgent = await loginTrackingAgent(phone);
  });

  test("rejects an upload with no label", async () => {
    const res = await attachPdf(
      superAdminAgent.post(`/api/contact-requests/${contactRequestId}/deliverables`)
    );
    assert.equal(res.status, 400);
  });

  test("rejects an unsupported file type", async () => {
    const res = await superAdminAgent
      .post(`/api/contact-requests/${contactRequestId}/deliverables`)
      .field("label", "التأشيرة الصادرة")
      .attach("file", Buffer.from("not a real file"), {
        filename: "malware.exe",
        contentType: "application/x-msdownload",
      });
    assert.equal(res.status, 400);
  });

  test("uploading to a nonexistent request returns 404", async () => {
    const res = await attachPdf(
      superAdminAgent
        .post("/api/contact-requests/does-not-exist/deliverables")
        .field("label", "التأشيرة الصادرة")
    );
    assert.equal(res.status, 404);
  });

  test("an unrelated customer can't download someone else's deliverable", async () => {
    const uploadRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "تذكرة الطيران")
    );
    const deliverableId = uploadRes.body.data.id;

    const attackerAgent = await loginTrackingAgent(`0932${uniqueSuffix()}`);
    const res = await attackerAgent.get(
      `/api/tracking/requests/${contactRequestId}/deliverables/${deliverableId}/file`
    );
    assert.equal(res.status, 404);
  });

  test("unauthenticated requests can't download a deliverable", async () => {
    const res = await request(app).get(
      `/api/tracking/requests/${contactRequestId}/deliverables/does-not-exist/file`
    );
    assert.equal(res.status, 401);
  });

  test("EMPLOYEE can deliver a file, but downloading a nonexistent one 404s", async () => {
    const employeePassword = "TestPass@12345";
    const employeeEmail = `deliverable-employee-${uniqueSuffix()}@nasaem-platform.local`;
    const createEmployeeRes = await superAdminAgent.post("/api/users").send({
      fullName: "Deliverable Test Employee",
      email: employeeEmail,
      password: employeePassword,
      role: "EMPLOYEE",
    });
    assert.equal(createEmployeeRes.status, 201);

    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email: employeeEmail, password: employeePassword });

    const uploadRes = await attachPdf(
      employeeAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "قسيمة الفندق")
    );
    assert.equal(uploadRes.status, 201);

    const missingRes = await employeeAgent.get(
      `/api/contact-requests/${contactRequestId}/deliverables/does-not-exist/file`
    );
    assert.equal(missingRes.status, 404);
  });
  // Runs last: publishing completes (and closes) the request.
  test("full flow: a prepared file stays hidden; published after payment and execution, the customer sees and downloads it", async () => {
    let tracked = (await customerAgent.get("/api/tracking/requests")).body.data.find((r) => r.id === contactRequestId);
    const draftsBefore = (await superAdminAgent.get(`/api/contact-requests/${contactRequestId}`)).body.data.deliverables.length;
    assert.equal(tracked.deliverables.length, 0, "earlier uploads in this file are drafts: never shown");
    assert.notEqual(tracked.statusLabel, "ملفاتك النهائية جاهزة للتحميل");

    const uploadRes = await attachPdf(
      superAdminAgent
        .post(`/api/contact-requests/${contactRequestId}/deliverables`)
        .field("label", "التأشيرة الصادرة")
    );
    assert.equal(uploadRes.status, 201, JSON.stringify(uploadRes.body));
    assert.equal(uploadRes.body.data.label, "التأشيرة الصادرة");
    assert.equal(uploadRes.body.data.publishedAt, null);
    const deliverableId = uploadRes.body.data.id;

    // Staff can download what they just uploaded; it shows in the staff detail.
    const staffFileRes = await superAdminAgent.get(`/api/contact-requests/${contactRequestId}/deliverables/${deliverableId}/file`);
    assert.equal(staffFileRes.status, 200);
    assert.equal(staffFileRes.headers["content-type"], "application/pdf");
    const detail = (await superAdminAgent.get(`/api/contact-requests/${contactRequestId}`)).body.data;
    assert.equal(detail.deliverables.length, draftsBefore + 1);

    // The customer neither sees nor downloads a draft.
    tracked = (await customerAgent.get("/api/tracking/requests")).body.data.find((r) => r.id === contactRequestId);
    assert.equal(tracked.deliverables.length, 0);
    assert.equal((await customerAgent.get(`/api/tracking/requests/${contactRequestId}/deliverables/${deliverableId}/file`)).status, 404);

    // Price -> approval -> transfer -> payment accepted -> execution -> publish.
    assert.equal((await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/invoice`).send({ amount: 100, currency: "SAR" })).status, 200);
    assert.equal((await customerAgent.post(`/api/tracking/requests/${contactRequestId}/invoice/approve`).send({ invoiceVersion: await quoteVersion(customerAgent, contactRequestId) })).status, 200);
    assert.equal((await customerAgent.post(`/api/tracking/requests/${contactRequestId}/mark-transfer-sent`)).status, 200);
    assert.equal((await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/confirm-payment`)).status, 200);
    assert.equal((await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/start-execution`).send({})).status, 200);
    const published = await superAdminAgent.post(`/api/contact-requests/${contactRequestId}/deliverables/${deliverableId}/publish`).send({});
    assert.equal(published.status, 200, JSON.stringify(published.body));

    tracked = (await customerAgent.get("/api/tracking/requests")).body.data.find((r) => r.id === contactRequestId);
    assert.equal(tracked.deliverables.length, 1, "only the published file is listed");
    assert.equal(tracked.deliverables[0].id, deliverableId);
    assert.equal(tracked.statusLabel, "تم إنجاز طلبك بنجاح");

    const customerFileRes = await customerAgent.get(`/api/tracking/requests/${contactRequestId}/deliverables/${deliverableId}/file`);
    assert.equal(customerFileRes.status, 200);
    assert.equal(customerFileRes.headers["content-type"], "application/pdf");

    // A different phone still cannot download the published file.
    const attackerAgent = await loginTrackingAgent(`0933${uniqueSuffix()}`);
    assert.equal((await attackerAgent.get(`/api/tracking/requests/${contactRequestId}/deliverables/${deliverableId}/file`)).status, 404);
  });
});
