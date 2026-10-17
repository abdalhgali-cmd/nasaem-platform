import "./env.js";
import "./helpers/journeyLimits.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, uniqueSuffix, quoteVersion } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

// Every service journey, end to end through the real API:
// selection -> travelers -> required documents per traveler (whatever the
// back-office configured, nothing invented) -> staff document review ->
// approved quote -> receipt -> staff payment approval -> service-specific
// execution -> final delivery. The customer side is checked through phone
// tracking; the staff side through the case detail. All three must agree.

const PDF = () => Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

const JOURNEYS = [
  // Flights, ferries and hotels have no document requirement in the seeded
  // catalog; a clearly-labelled TEST-WF requirement is configured through
  // the admin API for this run (and removed afterwards) so their document
  // path is exercised end to end, not skipped.
  { name: "flights", service: "SVC-FLIGHT", kind: "FLIGHT", execution: "جارٍ إصدار تذكرة الطيران", testRequirement: true },
  { name: "ferries", service: "SVC-FERRY", kind: "FERRY", execution: "جارٍ إصدار تذكرة العبّارة", testRequirement: true },
  { name: "hotels", service: "SVC-HOTEL", kind: "HOTEL", execution: "جارٍ تأكيد حجز الفندق", testRequirement: true },
  { name: "Umrah", service: "SVC-UMRAH", kind: "UMRAH", execution: "جارٍ إصدار التأشيرة" },
  { name: "family visit", visaType: "VISA-FAMILY-VISIT", kind: "FAMILY_VISIT", execution: "جارٍ استخراج تأشيرة الزيارة العائلية" },
  { name: "Egypt clearance", visaType: "VISA-EGYPT-CLEARANCE", kind: "EGYPT_CLEARANCE", execution: "جارٍ استخراج الموافقة الأمنية", travelPlan: true },
  { name: "dynamically configured visa", dynamicVisa: true, kind: "VISA", execution: "جارٍ استخراج التأشيرة" },
];

function answerFor(requirement) {
  if (requirement.type === "NUMBER") return 1;
  if (requirement.type === "YES_NO") return false;
  if (requirement.type === "DATE") return "2026-12-01";
  if (requirement.type === "SELECT") {
    const first = (requirement.options || [])[0];
    return typeof first === "string" ? first : first?.value ?? first?.label;
  }
  return "إجابة اختبار";
}

describe("service journeys: request -> documents -> quote -> payment -> execution -> delivery", () => {
  let admin;
  let employee;
  let accountant;
  let tracking;
  let dynamicVisa;
  const testRequirementIds = [];
  const phone = `091${uniqueSuffix().slice(-7)}`;

  before(async () => {
    admin = staffClient(await createStaffUser({ role: "ADMIN" }));
    employee = staffClient(await createStaffUser({ role: "EMPLOYEE" }));
    accountant = staffClient(await createStaffUser({ role: "ACCOUNTANT" }));

    // A visa configured from the back-office at run time — no code knows it.
    const created = await admin.post("/api/visa-types").send({
      code: `VISA-JOURNEY-${uniqueSuffix()}`,
      name: "تأشيرة سياحية (اختبار)",
      country: "تركيا",
      basePrice: 0,
      currency: "USD",
      active: true,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    dynamicVisa = created.body.data;
    const requirement = await admin.post(`/api/visa-types/${dynamicVisa.id}/requirements`).send({
      name: "صورة الجواز",
      type: "DOCUMENT",
      scope: "TRAVELER",
      required: true,
    });
    assert.equal(requirement.status, 201, JSON.stringify(requirement.body));

    for (const journey of JOURNEYS.filter((j) => j.testRequirement)) {
      const service = await prisma.service.findUnique({ where: { code: journey.service } });
      const added = await admin.post(`/api/services/${service.id}/requirements`).send({
        name: "TEST-WF صورة الجواز (اختبار)",
        type: "DOCUMENT",
        scope: "TRAVELER",
        required: true,
      });
      assert.equal(added.status, 201, JSON.stringify(added.body));
      testRequirementIds.push(added.body.data.id);
    }
  });

  after(async () => {
    if (dynamicVisa) await prisma.visaType.update({ where: { id: dynamicVisa.id }, data: { active: false } }).catch(() => {});
    for (const id of testRequirementIds) await admin.delete(`/api/services/requirements/${id}`);
  });

  async function trackingAgent() {
    if (tracking) return tracking;
    const agent = request.agent(app);
    const code = await request(app).post("/api/tracking/request-code").send({ phone });
    assert.equal(code.status, 200, JSON.stringify(code.body));
    const verify = await agent.post("/api/tracking/verify-code").send({ phone, code: code.body.debugCode });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    tracking = agent;
    return agent;
  }

  async function tracked(id) {
    const list = await (await trackingAgent()).get("/api/tracking/requests");
    assert.equal(list.status, 200);
    return list.body.data.find((row) => row.id === id);
  }

  for (const journey of JOURNEYS) {
    test(`${journey.name}: every stage, with the same status for staff and customer`, async () => {
      let target;
      if (journey.service) target = { field: "serviceId", row: await prisma.service.findUnique({ where: { code: journey.service } }) };
      else if (journey.visaType) target = { field: "visaTypeId", row: await prisma.visaType.findUnique({ where: { code: journey.visaType } }) };
      else target = { field: "visaTypeId", row: dynamicVisa };
      assert.ok(target.row, `${journey.name}: catalog entry must exist`);

      const base = target.field === "serviceId" ? "services" : "visa-types";
      const requirementsRes = await request(app).get(`/api/${base}/${target.row.id}/requirements/public`);
      assert.equal(requirementsRes.status, 200, JSON.stringify(requirementsRes.body));
      const requirements = requirementsRes.body.data.filter((r) => r.required && !r.conditionRequirementId);

      // 1) service selection + two travelers + each required document per traveler
      const travelers = [{ fullName: "المسافر الأول", isPrimary: true }, { fullName: "المسافر الثاني" }];
      const labels = [];
      const requirementIds = [];
      const travelerIndexes = [];
      for (const requirement of requirements.filter((r) => (r.type || "DOCUMENT") === "DOCUMENT")) {
        const owners = requirement.scope === "TRAVELER" ? ["0", "1"] : [""];
        for (const owner of owners) {
          labels.push(owner ? `${requirement.name} — ${travelers[Number(owner)].fullName}` : requirement.name);
          requirementIds.push(requirement.id);
          travelerIndexes.push(owner);
        }
      }
      const answers = Object.fromEntries(
        requirements.filter((r) => r.type && r.type !== "DOCUMENT").map((r) => [r.id, answerFor(r)])
      );

      let submit = request(app)
        .post("/api/contact-requests")
        .field("name", "عميل رحلة الاختبار")
        .field("phone", phone)
        .field("service", target.row.name)
        .field(target.field, target.row.id)
        .field("message", `طلب ${target.row.name}`)
        .field("travelerCount", "2")
        .field("travelers", JSON.stringify(travelers))
        .field("answers", JSON.stringify(answers))
        .field("documentLabels", JSON.stringify(labels))
        .field("documentRequirementIds", JSON.stringify(requirementIds))
        .field("documentTravelerIndexes", JSON.stringify(travelerIndexes));
      if (journey.kind === "UMRAH") submit = submit.field("guarantorPhone", "+966 50 000 0000");
      labels.forEach((label, index) => {
        submit = submit.attach("documents", PDF(), { filename: `doc-${index}.pdf`, contentType: "application/pdf" });
      });
      const created = await submit;
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.data.id;

      let detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
      assert.equal(detail.travelers.length, 2);
      assert.equal(detail.documents.length, labels.length, "every required document arrived");
      for (const document of detail.documents.filter((d) => d.requirementId)) {
        const requirement = requirements.find((r) => r.id === document.requirementId);
        if (requirement.scope === "TRAVELER") assert.ok(document.travelerId, "traveler documents belong to a traveler");
      }
      assert.equal(detail.progress.serviceKind, journey.kind);
      assert.equal(detail.progress.stage, "REVIEW");

      // 2) staff review the documents
      for (const document of detail.documents) {
        const reviewed = await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" });
        assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
      }

      // 3) quote, approved by the customer
      const invoice = await employee.post(`/api/contact-requests/${id}/invoice`).send({ amount: 250, currency: "USD", description: `سعر ${target.row.name}` });
      assert.equal(invoice.status, 200, JSON.stringify(invoice.body));
      assert.equal((await tracked(id)).progress.stage, "QUOTE_PENDING");
      const tracker = await trackingAgent();
      assert.equal((await tracker.post(`/api/tracking/requests/${id}/invoice/approve`).send({ invoiceVersion: await quoteVersion(tracker, id) })).status, 200);
      assert.equal((await tracked(id)).progress.stage, "AWAITING_PAYMENT");

      // execution cannot be recorded before the payment is accepted
      const early = await employee.post(`/api/contact-requests/${id}/start-execution`).send({});
      assert.equal(early.status, 409);
      assert.equal(early.body.code, "NOT_READY");
      assert.ok(early.body.reasons.some((reason) => reason.code === "PAYMENT_NOT_CONFIRMED"), JSON.stringify(early.body));

      // 4) receipt -> staff approval
      const receipt = await tracker.post(`/api/tracking/requests/${id}/payment-receipt`).field("label", "إثبات الدفع").attach("file", PDF(), { filename: "receipt.pdf", contentType: "application/pdf" });
      assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
      assert.equal((await tracked(id)).progress.stage, "PAYMENT_REVIEW");
      assert.equal((await accountant.post(`/api/contact-requests/${id}/confirm-payment`)).status, 200);

      // payment accepted means exactly "awaiting execution" — no service stage yet
      let customerView = await tracked(id);
      assert.equal(customerView.statusLabel, "تم قبول الدفع، بانتظار بدء التنفيذ");
      assert.equal(customerView.progress.stage, "PAYMENT_ACCEPTED");
      assert.notEqual(customerView.statusLabel, journey.execution);
      detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
      assert.equal(detail.progress.label, customerView.statusLabel, "staff and customer agree");
      assert.equal(detail.progress.canStartExecution, true);
      assert.equal(detail.readiness.overall, "READY_FOR_PROCESSING", "documents, answers and payment are complete");

      // 5) staff record the start of execution
      assert.equal((await accountant.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 403, "finance does not start execution");
      const started = await employee.post(`/api/contact-requests/${id}/start-execution`).send({ note: "أُرسل للجهة المختصة" });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      assert.equal(started.body.data.progress.label, journey.execution);
      assert.equal((await employee.post(`/api/contact-requests/${id}/start-execution`).send({})).status, 409, "recorded once");

      customerView = await tracked(id);
      assert.equal(customerView.statusLabel, journey.execution);
      assert.equal(customerView.progress.stage, "IN_EXECUTION");
      assert.equal(customerView.executionNote, undefined, "the staff note stays internal");
      assert.equal(customerView.executionStartedByUserId, undefined);
      detail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
      assert.equal(detail.progress.label, journey.execution);

      // 6) final delivery, per traveler: one traveler's file does not complete
      // the group; the request completes when every traveler is covered.
      const [first, second] = detail.travelers;
      const firstFile = await employee
        .post(`/api/contact-requests/${id}/deliverables`)
        .field("label", `الملف النهائي — ${first.fullName}`)
        .field("travelerIds", JSON.stringify([first.id]))
        .field("publish", "true")
        .attach("file", PDF(), { filename: "final-1.pdf", contentType: "application/pdf" });
      assert.equal(firstFile.status, 201, JSON.stringify(firstFile.body));
      customerView = await tracked(id);
      assert.notEqual(customerView.status, "CLOSED", "one of two travelers delivered");
      assert.equal(customerView.progress.steps.find((step) => step.key === "DELIVERY").state, "current");

      // the second traveler's file is prepared first, then published
      const secondFile = await employee
        .post(`/api/contact-requests/${id}/deliverables`)
        .field("label", `الملف النهائي — ${second.fullName}`)
        .field("travelerIds", JSON.stringify([second.id]))
        .attach("file", PDF(), { filename: "final-2.pdf", contentType: "application/pdf" });
      assert.equal(secondFile.status, 201, JSON.stringify(secondFile.body));
      assert.equal((await tracked(id)).deliverables.length, 1, "the prepared file is not visible yet");
      const published = await employee.post(`/api/contact-requests/${id}/deliverables/${secondFile.body.data.id}/publish`).send({});
      assert.equal(published.status, 200, JSON.stringify(published.body));

      customerView = await tracked(id);
      if (journey.travelPlan) {
        // Egypt clearance continues after the approval: the customer gives the
        // travel plan, then staff complete the request themselves.
        assert.equal(customerView.status, "CONTACTED", "Egypt clearance is never closed automatically");
        assert.equal(customerView.progress.stage, "DELIVERED");
        assert.ok(customerView.allowedActions.includes("SAVE_TRAVEL_PLAN"));
        const entry = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
        const plan = await tracker.post(`/api/tracking/requests/${id}/egypt-travel-plan`).field("entryMode", "AIR").field("bookingStatus", "EXISTING").field("entryDate", entry)
          .attach("file", PDF(), { filename: "ticket.pdf", contentType: "application/pdf" });
        assert.equal(plan.status, 200, JSON.stringify(plan.body));
        customerView = await tracked(id);
        assert.equal(customerView.intakeData.egyptTravel.circularStatus, "READY_FOR_CIRCULAR");
        // the ticket is a document to review before completion
        for (const document of (await employee.get(`/api/contact-requests/${id}`)).body.data.documents.filter((d) => d.status === "PENDING" && d.classification !== "FINANCIAL_DOCUMENT")) {
          assert.equal((await employee.patch(`/api/contact-requests/${id}/documents/${document.id}/status`).send({ status: "ACCEPTED" })).status, 200);
        }
        // the plan opened the circular task: not complete until it is done
        const early = await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" });
        assert.equal(early.status, 409, JSON.stringify(early.body));
        assert.ok(early.body.reasons.some((r) => r.code === "TRAVEL_TASKS_OPEN"), JSON.stringify(early.body));
        for (const task of await prisma.caseTask.findMany({ where: { contactRequestId: id, status: "OPEN", source: "SYSTEM" } })) {
          assert.equal((await employee.patch(`/api/contact-requests/${id}/tasks/${task.id}/complete`).send({})).status, 200);
        }
        const closed = await employee.patch(`/api/contact-requests/${id}/status`).send({ status: "CLOSED", outcome: "COMPLETED" });
        assert.equal(closed.status, 200, JSON.stringify(closed.body));
        customerView = await tracked(id);
        assert.equal((await tracker.post(`/api/tracking/requests/${id}/egypt-travel-plan`).field("entryMode", "AIR").field("bookingStatus", "NEEDS_NASAEM").field("entryDate", entry)).status, 409, "closed: read-only");
      }
      assert.equal(customerView.status, "CLOSED");
      assert.equal(customerView.outcome, "COMPLETED");
      assert.equal(customerView.statusLabel, "تم إنجاز طلبك بنجاح");
      assert.equal(customerView.deliverables.length, 2);
      assert.ok(customerView.progress.steps.every((step) => step.state === "done"));
      const download = await tracker.get(`/api/tracking/requests/${id}/deliverables/${customerView.deliverables[0].id}/file`);
      assert.equal(download.status, 200);
      if (journey.testRequirement) {
        const finalDetail = (await employee.get(`/api/contact-requests/${id}`)).body.data;
        for (const traveler of finalDetail.travelers) {
          assert.ok(finalDetail.documents.some((d) => d.travelerId === traveler.id && d.status === "ACCEPTED" && d.requirementId), `${journey.name}: ${traveler.fullName}'s configured document was required and accepted`);
        }
      }

      const actions = (await prisma.activityLog.findMany({ where: { entity: "ContactRequest", entityId: id } })).map((row) => row.action);
      for (const expected of ["CONTACT_REQUEST_PAYMENT_CONFIRMED", "CONTACT_REQUEST_EXECUTION_STARTED"]) {
        assert.ok(actions.includes(expected), `audit trail must contain ${expected}`);
      }
    });
  }
});
