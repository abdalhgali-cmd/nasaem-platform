import "./env.js";
import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { clearCapturedProviderEmails, getCapturedProviderEmails } from "../src/utils/providerEmail.js";

// Smart Case Operations — Release F (provider operations): package builder,
// EMAIL channel through the capture transport (no real message ever
// leaves), MANUAL_PORTAL recording, append-only submission history, and the
// authorization boundaries.
//
// PROVIDER_EMAIL_TRANSPORT=capture is set here rather than in .env.test so
// this file's intent is obvious at the point of use.
process.env.PROVIDER_EMAIL_TRANSPORT = "capture";

async function createProvider(agent, overrides = {}) {
  const suffix = uniqueSuffix();
  const res = await agent.post("/api/suppliers").send({
    code: `PRV-${suffix}`,
    name: `Provider ${suffix}`,
    type: "embassy",
    submissionChannel: "EMAIL",
    submissionEmail: `provider-${suffix}@example.test`,
    expectedProcessingDays: 5,
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

// Created directly rather than through the public endpoint: this file needs
// several cases and that endpoint is capped at 5 per 15 minutes (see
// contactRequestDocuments.test.js's own note on the same limiter).
async function createCaseWithDocuments() {
  const contactRequest = await prisma.contactRequest.create({
    data: {
      name: "Provider Case Customer",
      phone: `0921${uniqueSuffix()}`,
      phoneNormalized: `+249921${uniqueSuffix()}`,
      message: "حالة اختبار الإرسال للجهات",
      travelers: { create: [{ fullName: "Traveler One", sortOrder: 0 }] },
    },
    include: { travelers: true },
  });

  const customerDoc = await prisma.contactRequestDocument.create({
    data: {
      contactRequestId: contactRequest.id,
      label: "جواز السفر",
      fileName: "passport.png",
      storagePath: "contact-request-documents/passport-test.png",
      mimeType: "image/png",
      sizeBytes: 4,
      classification: "CUSTOMER_DOCUMENT",
      travelerId: contactRequest.travelers[0].id,
    },
  });

  const financialDoc = await prisma.contactRequestDocument.create({
    data: {
      contactRequestId: contactRequest.id,
      label: "إشعار الدفع",
      fileName: "receipt.png",
      storagePath: "contact-request-documents/receipt-test.png",
      mimeType: "image/png",
      sizeBytes: 4,
      classification: "FINANCIAL_DOCUMENT",
    },
  });

  return { contactRequest, customerDoc, financialDoc };
}

describe("provider package builder", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("excludes financial/internal documents from the default selection and explains why", async () => {
    const { contactRequest, customerDoc, financialDoc } = await createCaseWithDocuments();

    const res = await agent.get(`/api/contact-requests/${contactRequest.id}/provider-package`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const pkg = res.body.data;
    assert.equal(pkg.documents.length, 2, "every current document is listed, eligible or not");
    assert.deepEqual(pkg.defaultSelectedDocumentIds, [customerDoc.id], "only the customer document is selected by default");

    const financial = pkg.documents.find((d) => d.id === financialDoc.id);
    assert.equal(financial.eligibleByDefault, false);
    assert.ok(financial.excludedReason, "an excluded document explains itself rather than silently disappearing");

    // Traveler attribution comes through so an employee can see whose
    // passport they're about to send.
    const customer = pkg.documents.find((d) => d.id === customerDoc.id);
    assert.equal(customer.travelerName, "Traveler One");
  });
});

describe("provider submissions — EMAIL channel", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  beforeEach(() => clearCapturedProviderEmails());

  test("sends the selected documents and records a SUBMITTED audit row", async () => {
    const provider = await createProvider(agent);
    const { contactRequest, customerDoc } = await createCaseWithDocuments();

    const res = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id], notes: "يرجى المعالجة" });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.status, "SUBMITTED");
    assert.equal(res.body.data.channel, "EMAIL");
    assert.equal(res.body.data.recipient, provider.submissionEmail);
    assert.ok(res.body.data.submittedAt);
    assert.equal(res.body.data.documents.length, 1);

    const captured = getCapturedProviderEmails();
    assert.equal(captured.length, 1, "exactly one message was dispatched through the capture transport");
    assert.equal(captured[0].to, provider.submissionEmail);
    assert.match(captured[0].body, /Case reference/);
    assert.match(captured[0].body, /Traveler One/);
    assert.match(captured[0].body, /جواز السفر/);
    // The message never carries the customer's contact details.
    assert.ok(!captured[0].body.includes(contactRequest.phone), "a provider message must not carry the customer's phone");
  });

  test("refuses to package a financial document unless explicitly allowed, then logs the override", async () => {
    const provider = await createProvider(agent);
    const { contactRequest, customerDoc, financialDoc } = await createCaseWithDocuments();

    const blocked = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id, financialDoc.id] });

    assert.equal(blocked.status, 400);
    assert.match(blocked.body.message, /Internal\/financial/i);
    assert.equal(getCapturedProviderEmails().length, 0, "nothing may be sent when the package is refused");

    const allowed = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id, financialDoc.id], allowRestrictedDocuments: true });

    assert.equal(allowed.status, 201);
    assert.equal(allowed.body.data.documents.length, 2);
  });

  test("records FAILED with a reason rather than claiming success when the platform can't send", async () => {
    // Simulates an unconfigured platform: no capture transport, no
    // credentials — the honest outcome is a FAILED submission the staff can
    // see, never a row implying an embassy received the case.
    process.env.PROVIDER_EMAIL_TRANSPORT = "";
    try {
      const provider = await createProvider(agent);
      const { contactRequest, customerDoc } = await createCaseWithDocuments();

      const res = await agent
        .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
        .send({ supplierId: provider.id, documentIds: [customerDoc.id] });

      assert.equal(res.status, 201, "the attempt is still recorded");
      assert.equal(res.body.data.status, "FAILED");
      assert.equal(res.body.data.failureReason, "NOT_CONFIGURED");
      assert.equal(res.body.data.submittedAt, null);
    } finally {
      process.env.PROVIDER_EMAIL_TRANSPORT = "capture";
    }
  });

  test("a resend creates a second submission instead of overwriting the first (append-only history)", async () => {
    const provider = await createProvider(agent);
    const { contactRequest, customerDoc } = await createCaseWithDocuments();

    const first = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id] });
    const second = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id], notes: "إعادة إرسال" });

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.data.id, second.body.data.id);

    const listRes = await agent.get(`/api/contact-requests/${contactRequest.id}/provider-submissions`);
    assert.equal(listRes.body.data.length, 2, "both attempts survive");
  });
});

describe("provider submissions — MANUAL_PORTAL channel", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("records IN_PROGRESS, then completes with the provider's external reference", async () => {
    const provider = await createProvider(agent, {
      submissionChannel: "MANUAL_PORTAL",
      submissionEmail: null,
      portalUrl: "https://provider.example.test/portal",
    });
    const { contactRequest, customerDoc } = await createCaseWithDocuments();

    const startRes = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id] });

    assert.equal(startRes.status, 201, JSON.stringify(startRes.body));
    assert.equal(startRes.body.data.status, "IN_PROGRESS");
    assert.equal(startRes.body.data.recipient, "https://provider.example.test/portal");
    assert.equal(startRes.body.data.submittedAt, null);

    const completeRes = await agent
      .patch(`/api/contact-requests/${contactRequest.id}/provider-submissions/${startRes.body.data.id}`)
      .send({ externalReference: "EMB-2026-77421" });

    assert.equal(completeRes.status, 200, JSON.stringify(completeRes.body));
    assert.equal(completeRes.body.data.status, "SUBMITTED");
    assert.equal(completeRes.body.data.externalReference, "EMB-2026-77421");
    assert.ok(completeRes.body.data.submittedAt);

    // Completing twice is refused — the record is final once submitted.
    const again = await agent
      .patch(`/api/contact-requests/${contactRequest.id}/provider-submissions/${startRes.body.data.id}`)
      .send({ externalReference: "EMB-OTHER" });
    assert.equal(again.status, 409);
  });
});

describe("provider submissions — authorization and ownership", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  test("a provider with no submission channel configured cannot be used", async () => {
    const provider = await createProvider(agent, { submissionChannel: null, submissionEmail: null });
    const { contactRequest, customerDoc } = await createCaseWithDocuments();

    const res = await agent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id] });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /channel/i);
  });

  test("a document from another case can never be packaged into this one (IDOR)", async () => {
    const provider = await createProvider(agent);
    const caseA = await createCaseWithDocuments();
    const caseB = await createCaseWithDocuments();

    const res = await agent
      .post(`/api/contact-requests/${caseA.contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [caseB.customerDoc.id] });

    assert.equal(res.status, 400, "another case's document must not be sendable from this case");
  });

  test("a submission id from another case cannot be completed through this case's URL (IDOR)", async () => {
    const provider = await createProvider(agent, {
      submissionChannel: "MANUAL_PORTAL",
      submissionEmail: null,
      portalUrl: "https://provider.example.test/portal",
    });
    const caseA = await createCaseWithDocuments();
    const caseB = await createCaseWithDocuments();

    const created = await agent
      .post(`/api/contact-requests/${caseA.contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [] });
    assert.equal(created.status, 201);

    const crossRes = await agent
      .patch(`/api/contact-requests/${caseB.contactRequest.id}/provider-submissions/${created.body.data.id}`)
      .send({ externalReference: "X" });

    assert.equal(crossRes.status, 404);
  });

  test("an ACCOUNTANT cannot send a case to a provider", async () => {
    const suffix = uniqueSuffix();
    const email = `provider-accountant-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({
      fullName: "Provider RBAC Accountant",
      email,
      password: "TestPass@12345",
      role: "ACCOUNTANT",
    });
    const accountantAgent = request.agent(app);
    await accountantAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const provider = await createProvider(agent);
    const { contactRequest, customerDoc } = await createCaseWithDocuments();

    const res = await accountantAgent
      .post(`/api/contact-requests/${contactRequest.id}/provider-submissions`)
      .send({ supplierId: provider.id, documentIds: [customerDoc.id] });

    assert.equal(res.status, 403);
  });
});
