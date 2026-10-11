import "../env.js";
import assert from "node:assert/strict";
import prisma from "../../src/config/database.js";
import { signTrackingToken } from "../../src/utils/jwt.js";
import { normalizePhone } from "../../src/utils/phone.js";
import { app, request, uniqueSuffix } from "./api.js";

// Fixtures for request-workflow tests. Everything created here is marked as
// a test fixture (names/codes start with "TEST-WF"); nothing resembles a real
// agency requirement, price or account.

export const PDF = () => Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

export function testPhone() {
  return `091${uniqueSuffix().slice(-7)}`;
}

// A phone-tracking session minted directly (the OTP flow itself is covered
// elsewhere): lets a test act as the customer without spending the
// request-code limiter.
export function trackingClient(rawPhone) {
  const token = signTrackingToken(normalizePhone(rawPhone));
  const withAuth = (req) => req.set("Authorization", `Bearer ${token}`).set("X-Requested-With", "XMLHttpRequest");
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url) => withAuth(request(app).post(url)),
    async request(id) {
      const res = await withAuth(request(app).get("/api/tracking/requests"));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body.data.find((row) => row.id === id);
    },
  };
}

// A visa type configured at run time with one per-traveler required document.
export async function createTestVisa(admin, { requirementScope = "TRAVELER" } = {}) {
  const created = await admin.post("/api/visa-types").send({
    code: `TEST-WF-${uniqueSuffix()}`,
    name: "TEST-WF تأشيرة اختبار",
    country: "TEST",
    basePrice: 0,
    currency: "USD",
    active: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const requirement = await admin.post(`/api/visa-types/${created.body.data.id}/requirements`).send({
    name: "TEST-WF صورة الجواز",
    type: "DOCUMENT",
    scope: requirementScope,
    required: true,
  });
  assert.equal(requirement.status, 201, JSON.stringify(requirement.body));
  return { visaType: created.body.data, requirement: requirement.body.data };
}

// Submits a request for `travelers` people, with the per-traveler document
// attached for the travelers listed in `withDocsFor` (all by default).
export async function submitRequest({ phone, visaType, requirement, travelers = 2, withDocsFor }) {
  const names = Array.from({ length: travelers }, (_, index) => `TEST-WF مسافر ${index + 1}`);
  const owners = (withDocsFor ?? names.map((_, index) => index)).map(String);
  let req = request(app)
    .post("/api/contact-requests")
    .field("name", "TEST-WF عميل")
    .field("phone", phone)
    .field("message", "TEST-WF طلب")
    .field("visaTypeId", visaType.id)
    .field("travelers", JSON.stringify(names.map((fullName, index) => ({ fullName, isPrimary: index === 0 }))))
    .field("documentLabels", JSON.stringify(owners.map((owner) => `جواز ${owner}`)))
    .field("documentRequirementIds", JSON.stringify(owners.map(() => requirement.id)))
    .field("documentTravelerIndexes", JSON.stringify(owners));
  for (const owner of owners) req = req.attach("documents", PDF(), { filename: `passport-${owner}.pdf`, contentType: "application/pdf" });
  const res = await req;
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
}

export async function staffDetail(staff, id) {
  const res = await staff.get(`/api/contact-requests/${id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

export async function acceptAllDocuments(staff, id) {
  const detail = await staffDetail(staff, id);
  for (const document of detail.documents.filter((d) => d.status === "PENDING" && !d.supersededAt && d.classification !== "FINANCIAL_DOCUMENT")) {
    const res = await staff.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
}

export async function priceAndApprove({ staff, tracking, id, amount = 100 }) {
  const invoice = await staff.post(`/api/contact-requests/${id}/invoice`).send({ amount, currency: "USD", description: "TEST-WF" });
  assert.equal(invoice.status, 200, JSON.stringify(invoice.body));
  const approved = await tracking.post(`/api/tracking/requests/${id}/invoice/approve`).send({});
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
}

export async function uploadReceipt(tracking, id) {
  const res = await tracking.post(`/api/tracking/requests/${id}/payment-receipt`).field("label", "إثبات الدفع").attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
}

// documents accepted -> price approved -> receipt -> payment confirmed
export async function readyAndPaid({ staff, accountant, tracking, id }) {
  await acceptAllDocuments(staff, id);
  await priceAndApprove({ staff, tracking, id });
  await uploadReceipt(tracking, id);
  const confirmed = await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({});
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
}

export function deliverable(staff, id, { label = "TEST-WF الملف النهائي", travelerIds, publish } = {}) {
  let req = staff.post(`/api/contact-requests/${id}/deliverables`).field("label", label);
  if (travelerIds) req = req.field("travelerIds", JSON.stringify(travelerIds));
  if (publish !== undefined) req = req.field("publish", String(publish));
  return req.attach("file", PDF(), { filename: "final.pdf", contentType: "application/pdf" });
}

export async function activityActions(id) {
  return (await prisma.activityLog.findMany({ where: { entity: "ContactRequest", entityId: id }, orderBy: { createdAt: "asc" } })).map((row) => row.action);
}
