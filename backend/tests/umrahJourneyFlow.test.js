import "./env.js";
import "./helpers/journeyLimits.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/config/database.js";
import { app, registerCustomer, request, uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";
import { PDF, testPhone, trackingClient } from "./helpers/workflow.js";
import { NO_ACTION_MESSAGE } from "../src/modules/umrah/umrah-journey.js";

// «رحلتي إلى الحرمين» end to end over HTTP: several pilgrims, a document
// sent back and requested again, a rejected then an accepted receipt,
// visas issued one pilgrim at a time, the included services, secure
// downloads, and who may do what. What the customer sees comes from the
// server's journey object (progress.umrah), never computed on the device.

const PRICE = 900;
const GUARANTOR = "+966 55 000 1111";

let admin;
let employee;
let accountant;

before(async () => {
  admin = staffClient(await createStaffUser({ role: "ADMIN" }));
  employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
  accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));
  const account = await admin.post("/api/payment-accounts").send({
    name: `TEST-WF حساب رحلتي ${uniqueSuffix()}`,
    bankName: "TEST-WF Bank",
    accountName: "TEST-WF Holder",
    accountNumber: `8${uniqueSuffix().slice(-9)}`,
    currency: "SAR",
  });
  assert.equal(account.status, 201, JSON.stringify(account.body));
});

async function umrahPackage(kind) {
  const created = await admin.post("/api/services").send({
    code: `TEST-WF-JOURNEY-${kind}-${uniqueSuffix()}`,
    name: `TEST-WF رحلتي ${kind}`,
    category: "UMRAH_PACKAGE",
    basePrice: PRICE,
    currency: "SAR",
    active: true,
    pricingMode: "FIXED",
    priceUnit: "PER_TRAVELER",
    features: [`KIND: ${kind}`, "INCLUDED: إصدار تأشيرة العمرة", "EXCLUDED: الوجبات"],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  for (const requirement of [
    { name: "صورة الجواز", type: "DOCUMENT", scope: "TRAVELER", required: true },
    { name: "إقامة الضامن", type: "DOCUMENT", scope: "CASE", required: true },
  ]) {
    const added = await admin.post(`/api/services/${created.body.data.id}/requirements`).send(requirement);
    assert.equal(added.status, 201, JSON.stringify(added.body));
  }
  const requirements = (await request(app).get(`/api/services/${created.body.data.id}/requirements/public`)).body.data.filter((r) => r.type === "DOCUMENT" && r.required);
  return { service: created.body.data, requirements };
}

async function submit({ service, requirements }, { phone, pilgrims, submissionKey = randomUUID(), agent = null }) {
  const travelers = Array.from({ length: pilgrims }, (_, i) => ({ fullName: `المعتمر ${i + 1}`, passportNo: `P20000${i}`, isPrimary: i === 0 }));
  const labels = [];
  const ids = [];
  const owners = [];
  for (const requirement of requirements) {
    for (const owner of requirement.scope === "TRAVELER" ? travelers.map((_, i) => String(i)) : [""]) {
      labels.push(requirement.name);
      ids.push(requirement.id);
      owners.push(owner);
    }
  }
  let req = (agent ? agent.post("/api/contact-requests").set("X-Requested-With", "XMLHttpRequest") : request(app).post("/api/contact-requests"))
    .field("name", "TEST-WF مقدم رحلتي")
    .field("phone", phone)
    .field("service", service.name)
    .field("serviceId", service.id)
    .field("message", "TEST-WF رحلتي إلى الحرمين")
    .field("travelerCount", String(pilgrims))
    .field("travelers", JSON.stringify(travelers))
    .field("acceptedTotal", String(PRICE * pilgrims))
    .field("acceptedCurrency", "SAR")
    .field("guarantorPhone", GUARANTOR)
    .field("submissionKey", submissionKey)
    .field("documentLabels", JSON.stringify(labels))
    .field("documentRequirementIds", JSON.stringify(ids))
    .field("documentTravelerIndexes", JSON.stringify(owners));
  labels.forEach((_, index) => {
    req = req.attach("documents", PDF(), { filename: `doc-${index}.pdf`, contentType: "application/pdf" });
  });
  return req;
}

const journeyOf = async (customer, id) => (await customer.request(id)).progress.umrah;
const notificationTypes = async (id) => (await prisma.notification.findMany({ where: { contactRequestId: id }, select: { type: true } })).map((n) => n.type);
const stage = (journey, key) => journey.stages.find((s) => s.key === key);

function visa(id, { label, travelerIds, kind, publish = true }) {
  let req = employee.post(`/api/contact-requests/${id}/deliverables`).field("label", label).field("travelerIds", JSON.stringify(travelerIds));
  if (kind) req = req.field("kind", kind);
  if (publish) req = req.field("publish", "true");
  return req.attach("file", PDF(), { filename: "visa.pdf", contentType: "application/pdf" });
}

describe("«رحلتي إلى الحرمين» — the full Umrah journey", () => {
  test("AIR, three pilgrims: documents → receipt rejected then accepted → visas one by one → services → complete", async () => {
    const pkg = await umrahPackage("AIR");
    // an account holder: in-app notifications reach their inbox
    const { agent: account, customer: owner } = await registerCustomer();
    const phone = owner.phone;
    const submissionKey = randomUUID();
    const created = await submit(pkg, { phone, pilgrims: 3, submissionKey, agent: account });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id } = created.body.data;
    // network loss: the same submission sent again is the same request
    const again = await submit(pkg, { phone, pilgrims: 3, submissionKey, agent: account });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.data.id, id);
    assert.equal(await prisma.contactRequest.count({ where: { phone } }), 1, "no duplicate request");
    assert.ok((await notificationTypes(id)).includes("CONTACT_REQUEST_RECEIVED"));
    // the account's own view carries the same journey
    const portal = await account.get(`/api/customer/requests/${id}`);
    assert.equal(portal.status, 200, JSON.stringify(portal.body));
    assert.equal(portal.body.data.progress.umrah.reference, id);
    const { agent: stranger } = await registerCustomer();
    assert.equal((await stranger.get(`/api/customer/requests/${id}`)).status, 404, "no cross-customer exposure");

    const customer = trackingClient(phone);
    let journey = await journeyOf(customer, id);
    assert.equal(journey.title, "رحلتي إلى الحرمين");
    assert.equal(journey.reference, id);
    assert.equal(journey.packageKind, "AIR");
    assert.equal(journey.pilgrimCount, 3);
    assert.equal(journey.servicesIncluded, true);
    assert.deepEqual(journey.stages.map((s) => s.label), ["تقديم الطلب", "مراجعة المستندات", "تأكيد الدفع", "إجراءات التأشيرة", "إصدار التأشيرات", "تسليم الخدمات المشمولة", "اكتمال الرحلة"]);
    assert.equal(stage(journey, "SUBMITTED").state, "done");
    assert.ok(journey.pilgrims.every((p) => p.visa === "PENDING" && p.services === "PENDING"));

    // staff: one passport sent back with a reason, then requested specifically
    let detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
    const second = detail.travelers.find((t) => t.fullName === "المعتمر 2");
    const passport = detail.documents.find((d) => d.travelerId === second.id);
    const passportRequirement = pkg.requirements.find((r) => r.scope === "TRAVELER");
    const underReview = await employee.post(`/api/contact-requests/${id}/document-requests`).send({ requirementId: passportRequirement.id, travelerId: second.id });
    assert.equal(underReview.status, 409, "a document with staff is reviewed, not requested");
    assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${passport.id}/status`).send({ status: "REJECTED", reviewNote: "الصورة غير واضحة" })).status, 200);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/document-requests`).send({ requirementId: passportRequirement.id, travelerId: second.id })).status, 403, "finance does not request documents");
    assert.equal((await customer.post(`/api/contact-requests/${id}/document-requests`).send({ requirementId: passportRequirement.id })).status, 401, "a customer is not staff");
    const requested = await employee.post(`/api/contact-requests/${id}/document-requests`).send({ requirementId: passportRequirement.id, travelerId: second.id, note: "صفحة البيانات كاملة وبإضاءة جيدة" });
    assert.equal(requested.status, 201, JSON.stringify(requested.body));
    assert.equal(requested.body.data.state, "REJECTED");
    assert.ok((await notificationTypes(id)).includes("CONTACT_REQUEST_DOCUMENT_REQUESTED"));
    assert.ok(await prisma.activityLog.findFirst({ where: { entityId: id, action: "CONTACT_REQUEST_DOCUMENT_REQUESTED" } }), "audited");

    journey = await journeyOf(customer, id);
    assert.equal(journey.primaryAction.key, "COMPLETE_DOCUMENTS");
    assert.equal(journey.now.actor, "CUSTOMER");
    assert.equal(journey.now.actionRequired, true);

    // the customer replaces the passport; staff accept everything
    const replaced = await customer.post(`/api/tracking/requests/${id}/documents`)
      .field("label", "صورة الجواز").field("requirementId", passportRequirement.id).field("travelerId", second.id)
      .attach("file", PDF(), { filename: "passport.pdf", contentType: "application/pdf" });
    assert.equal(replaced.status, 201, JSON.stringify(replaced.body));
    detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
    for (const document of detail.documents.filter((d) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
      assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" })).status, 200);
    }

    // payment: a receipt is never a payment; a rejected one asks for a replacement
    journey = await journeyOf(customer, id);
    assert.equal(journey.primaryAction.key, "PAY");
    assert.equal(stage(journey, "PAYMENT").state, "current");
    const receipt = () => customer.post(`/api/tracking/requests/${id}/payment-receipt`).attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" });
    assert.equal((await receipt()).status, 201);
    journey = await journeyOf(customer, id);
    assert.equal(journey.primaryAction, null, "under review: nothing for the customer to do");
    assert.equal(journey.now.actionRequired, false);
    assert.equal(journey.now.noActionMessage, NO_ACTION_MESSAGE);
    assert.equal((await employee.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 403, "only finance confirms");
    assert.equal((await accountant.post(`/api/contact-requests/${id}/reject-payment`).send({ reason: "المبلغ ناقص" })).status, 200);
    journey = await journeyOf(customer, id);
    assert.equal(journey.primaryAction.key, "REUPLOAD_RECEIPT");
    assert.match(journey.now.message, /المبلغ ناقص/);
    assert.equal((await receipt()).status, 201);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 409, "no double confirmation");
    assert.ok((await notificationTypes(id)).includes("CONTACT_REQUEST_PAYMENT_CONFIRMED"));

    // visa procedures
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);
    assert.ok((await notificationTypes(id)).includes("CONTACT_REQUEST_EXECUTION_STARTED"));
    journey = await journeyOf(customer, id);
    assert.equal(journey.now.stepKey, "VISA_PROCEDURES");
    assert.equal(journey.now.actor, "AGENCY");
    assert.equal(journey.now.message === NO_ACTION_MESSAGE || typeof journey.now.message === "string", true);
    assert.equal(journey.now.noActionMessage, NO_ACTION_MESSAGE);
    assert.ok(journey.pilgrims.every((p) => p.visa === "IN_PROGRESS"));

    // one pilgrim's visa: not all visas
    detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
    const [p1, p2, p3] = ["المعتمر 1", "المعتمر 2", "المعتمر 3"].map((name) => detail.travelers.find((t) => t.fullName === name));
    const firstVisa = await visa(id, { label: "تأشيرة المعتمر 1", travelerIds: [p1.id] });
    assert.equal(firstVisa.status, 201, JSON.stringify(firstVisa.body));
    assert.equal(firstVisa.body.data.kind, "VISA");
    journey = await journeyOf(customer, id);
    assert.equal(journey.visasIssued, 1);
    assert.deepEqual(journey.pilgrims.map((p) => p.visa), ["ISSUED", "IN_PROGRESS", "IN_PROGRESS"]);
    assert.equal(journey.pilgrims[0].visaFiles.length, 1);
    assert.equal(journey.pilgrims[1].visaFiles.length, 0, "a visa is linked to its own pilgrim only");
    assert.equal(stage(journey, "VISAS").state, "current");
    assert.match(stage(journey, "VISAS").status, /1 من 3/);
    assert.equal(journey.primaryAction.key, "DOWNLOAD_VISAS");
    assert.ok((await notificationTypes(id)).includes("UMRAH_VISA_ISSUED"));
    assert.ok(!(await notificationTypes(id)).includes("UMRAH_ALL_VISAS_ISSUED"));

    // secure download: the owner only; a prepared (unpublished) file is not served
    const own = await customer.get(`/api/tracking/requests/${id}/deliverables/${firstVisa.body.data.id}/file`);
    assert.equal(own.status, 200);
    assert.equal((await trackingClient(testPhone()).get(`/api/tracking/requests/${id}/deliverables/${firstVisa.body.data.id}/file`)).status, 404, "another customer cannot download it");
    assert.equal((await request(app).get(`/api/tracking/requests/${id}/deliverables/${firstVisa.body.data.id}/file`)).status, 401);
    const draft = await visa(id, { label: "تأشيرة المعتمر 2", travelerIds: [p2.id], publish: false });
    assert.equal(draft.status, 201);
    assert.equal((await customer.get(`/api/tracking/requests/${id}/deliverables/${draft.body.data.id}/file`)).status, 404, "unpublished");
    assert.equal((await journeyOf(customer, id)).visasIssued, 1, "a draft is not an issued visa");

    // the remaining visas
    assert.equal((await employee.post(`/api/contact-requests/${id}/deliverables/${draft.body.data.id}/publish`).send({})).status, 200);
    assert.equal((await visa(id, { label: "تأشيرة المعتمر 3", travelerIds: [p3.id] })).status, 201);
    journey = await journeyOf(customer, id);
    assert.equal(journey.visasIssued, 3);
    assert.equal(stage(journey, "VISAS").state, "done");
    assert.equal(stage(journey, "SERVICES").state, "current");
    assert.ok((await notificationTypes(id)).includes("UMRAH_ALL_VISAS_ISSUED"));
    let row = await prisma.contactRequest.findUnique({ where: { id }, select: { status: true } });
    assert.notEqual(row.status, "CLOSED", "a services package is not complete at the visas");
    const blocked = await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" });
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.ok(JSON.stringify(blocked.body).includes("SERVICES_INCOMPLETE"), "cannot be completed before the services");

    // the included services
    const services = await visa(id, { label: "تذاكر الطيران والسكن", travelerIds: [p1.id, p2.id, p3.id], kind: "SERVICE" });
    assert.equal(services.status, 201, JSON.stringify(services.body));
    assert.equal(services.body.data.kind, "SERVICE");
    row = await prisma.contactRequest.findUnique({ where: { id }, select: { status: true, outcome: true } });
    assert.equal(row.status, "CLOSED");
    assert.equal(row.outcome, "COMPLETED");
    const types = await notificationTypes(id);
    assert.ok(types.includes("UMRAH_SERVICES_DELIVERED"));
    journey = await journeyOf(customer, id);
    assert.ok(journey.stages.every((s) => s.state === "done"));
    assert.ok(journey.pilgrims.every((p) => p.visa === "ISSUED" && p.services === "DELIVERED"));
    assert.equal(journey.primaryAction.key, "VIEW_FILES");
    assert.equal(journey.now.actionRequired, false);
    assert.equal((await customer.get(`/api/tracking/requests/${id}/deliverables/${services.body.data.id}/file`)).status, 200);
  });

  test("VISA_ONLY, one pilgrim: no services stage, a service document is refused, the visa completes it", async () => {
    const pkg = await umrahPackage("VISA_ONLY");
    const { agent: account, customer: owner } = await registerCustomer();
    const phone = owner.phone;
    const created = await submit(pkg, { phone, pilgrims: 1, agent: account });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const { id } = created.body.data;
    const customer = trackingClient(phone);
    let journey = await journeyOf(customer, id);
    assert.equal(journey.packageKind, "VISA_ONLY");
    assert.equal(journey.servicesIncluded, false);
    assert.equal(stage(journey, "SERVICES").state, "not_included");
    assert.equal(journey.pilgrims[0].services, undefined);
    assert.equal(journey.ticketBooking.available, false);
    assert.equal((await customer.post(`/api/tracking/requests/${id}/umrah/tickets`).send({})).status, 409, "tickets follow visa issuance");
    assert.equal((await request(app).post(`/api/tracking/requests/${id}/umrah/tickets`).send({})).status, 401);

    const detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
    for (const document of detail.documents) {
      assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" })).status, 200);
    }
    assert.equal((await customer.post(`/api/tracking/requests/${id}/payment-receipt`).attach("file", PDF(), { filename: "r.pdf", contentType: "application/pdf" })).status, 201);
    assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`).send({})).status, 200);
    assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 200);

    const refused = await visa(id, { label: "تذكرة", travelerIds: [detail.travelers[0].id], kind: "SERVICE" });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "SERVICES_NOT_INCLUDED");
    assert.equal((await accountant.post(`/api/contact-requests/${id}/deliverables`).field("label", "x").attach("file", PDF(), { filename: "v.pdf", contentType: "application/pdf" })).status, 403, "finance does not upload visas");

    const issued = await visa(id, { label: "التأشيرة", travelerIds: [detail.travelers[0].id] });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    const row = await prisma.contactRequest.findUnique({ where: { id }, select: { status: true, outcome: true } });
    assert.equal(row.status, "CLOSED");
    assert.equal(row.outcome, "COMPLETED");
    journey = await journeyOf(customer, id);
    assert.equal(journey.primaryAction.key, "VIEW_FILES");
    assert.ok((await notificationTypes(id)).includes("UMRAH_ALL_VISAS_ISSUED"));
    assert.equal(journey.ticketBooking.available, true, "optional booking is offered after completion");
    const stranger = trackingClient(testPhone());
    assert.equal((await stranger.post(`/api/tracking/requests/${id}/umrah/tickets`).send({})).status, 404);
    const { agent: otherAccount } = await registerCustomer();
    assert.equal((await otherAccount.post(`/api/customer/requests/${id}/umrah/tickets`).send({})).status, 404);
    const [booking, retry] = await Promise.all([
      customer.post(`/api/tracking/requests/${id}/umrah/tickets`).send({}),
      account.post(`/api/customer/requests/${id}/umrah/tickets`).send({}),
    ]);
    assert.deepEqual([booking.status, retry.status].sort(), [200, 201]);
    assert.equal(booking.body.data.inquiryId, retry.body.data.inquiryId);
    const inquiries = await prisma.contactRequest.findMany({ where: { parentRequestId: id, linkKind: "UMRAH_TICKET" }, include: { invoice: true, travelers: true } });
    assert.equal(inquiries.length, 1);
    assert.equal(inquiries[0].pricingMode, "QUOTE");
    assert.equal(inquiries[0].invoice, null, "no unapproved fare is invented");
    assert.equal(inquiries[0].customerId, owner.id);
    assert.equal(inquiries[0].travelers.length, 1);
    // The copy points at the exact pilgrim it came from (by id, not by name or order).
    const parentTravelers = await prisma.traveler.findMany({ where: { contactRequestId: id }, orderBy: { sortOrder: "asc" } });
    assert.deepEqual(inquiries[0].travelers.map((t) => t.sourceTravelerId), parentTravelers.map((t) => t.id));
    assert.equal((await prisma.contactRequest.findUnique({ where: { id } })).outcome, "COMPLETED", "booking does not reopen or block the visa case");
    assert.equal(await prisma.activityLog.count({ where: { entityId: id, action: "UMRAH_TICKET_INQUIRY_OPENED" } }), 1);
    journey = await journeyOf(customer, id);
    assert.equal(journey.ticketBooking.available, false);
    assert.equal(journey.ticketBooking.inquiryId, inquiries[0].id);
  });
});
