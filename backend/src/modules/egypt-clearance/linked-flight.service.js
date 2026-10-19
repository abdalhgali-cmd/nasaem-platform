// "Book the flight through Nasaem" for an Egypt security approval. The
// answer is recorded on the approval request (intakeData.egyptFlight); a
// REQUEST opens ONE linked flight booking inquiry: an ordinary flight request
// (SVC-FLIGHT, priced by staff as a quote) that points back to the approval
// (parentRequestId, linkKind EGYPT_FLIGHT). No fare, seat availability or
// booking reference is ever created here — staff quote, book and publish the
// ticket on that inquiry, and it shows on the approval as a ticket. The
// inquiry never blocks the approval.
import prisma from "../../config/database.js";
import { trackingScope } from "../../utils/publicOrganization.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";
import { pendingConfirmationCreate } from "../customer-messages/customer-messages.service.js";
import { ACTIONS, checkAction } from "../contact-request-workflow/workflow-policy.js";
import { auditInTransaction, refuseWith, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import { FLIGHT_CHOICES, FLIGHT_LINK_KIND, linkedFlightInquiry, requestTravelDate } from "./egypt-approval-rules.js";

const FLIGHT_SERVICE_CODE = "SVC-FLIGHT";

function inquiryMessage(parent) {
  const route = parent.intakeData?.egyptRoute || {};
  const date = requestTravelDate(parent);
  return [
    `طلب حجز تذكرة طيران مرتبط بطلب الموافقة الأمنية لمصر (${parent.id}).`,
    `من: ${route.departureCity || "غير محدد"} — إلى: ${route.arrivalAirport || "القاهرة"}.`,
    `تاريخ السفر: ${date || "لم يُحدَّد بعد"}. عدد المسافرين: ${Math.max(1, parent.travelers?.length || 1)}.`,
    "لا يوجد سعر أو حجز بعد: يُسعَّر ويُحجز من الوكالة.",
  ].join("\n");
}

// Inside the approval request's locked transaction: creates the inquiry once.
async function createInquiryInTransaction(tx, parent) {
  const existing = linkedFlightInquiry(parent) || (await tx.contactRequest.findFirst({ where: { parentRequestId: parent.id, linkKind: FLIGHT_LINK_KIND }, select: { id: true } }));
  if (existing) return { inquiry: existing, created: false };
  const service = await tx.service.findFirst({ where: { code: FLIGHT_SERVICE_CODE }, select: { id: true, name: true } });
  const inquiry = await tx.contactRequest.create({
    data: {
      name: parent.name,
      phone: parent.phone,
      phoneNormalized: parent.phoneNormalized,
      email: parent.email,
      organizationId: parent.organizationId,
      customerId: parent.customerId,
      service: service?.name || "تذاكر الطيران",
      serviceId: service?.id || null,
      requestKind: "SERVICE_APPLICATION",
      pricingMode: "QUOTE",
      travelerCount: Math.max(1, parent.travelers?.length || 1),
      message: inquiryMessage(parent),
      intakeData: { linkedFrom: parent.id, route: parent.intakeData?.egyptRoute || null, travelDate: requestTravelDate(parent) },
      parentRequestId: parent.id,
      linkKind: FLIGHT_LINK_KIND,
      travelers: { create: (parent.travelers || []).map((t, index) => ({ fullName: t.fullName, isPrimary: index === 0, sortOrder: index })) },
      customerMessages: pendingConfirmationCreate(parent.phoneNormalized),
    },
    select: { id: true },
  });
  return { inquiry, created: true };
}

// The customer's answer (REQUEST | BOOKED | LATER), under the approval
// request's row lock. `scope` limits who may see the request (phone tracking
// or account); null for the system at submission.
export async function recordFlightChoice(contactRequestId, scope, choice, { actor = "CUSTOMER" } = {}) {
  if (!FLIGHT_CHOICES.includes(choice)) return { refusal: { status: 400, code: "INVALID_CHOICE", message: "اختيار غير صالح." } };
  const result = await withLockedRequest(contactRequestId, scope, async (tx, request) => {
    const refusal = checkAction(ACTIONS.REQUEST_FLIGHT_BOOKING, request);
    if (refusal) refuseWith(refusal);
    // The system only completes a REQUEST that is still the stored answer
    // (the customer may have changed it meanwhile).
    if (actor !== "CUSTOMER" && request.intakeData?.egyptFlight?.choice !== choice) return { skipped: true };
    const previous = request.intakeData?.egyptFlight?.choice || null;
    await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { intakeData: { ...(request.intakeData || {}), egyptFlight: { choice, updatedAt: new Date().toISOString() } } },
    });
    const opened = choice === "REQUEST" ? await createInquiryInTransaction(tx, request) : { inquiry: linkedFlightInquiry(request), created: false };
    await auditInTransaction(tx, {
      action: "EGYPT_FLIGHT_CHOICE_RECORDED",
      entityId: contactRequestId,
      organizationId: request.organizationId,
      oldValue: { choice: previous },
      newValue: { choice, by: actor, inquiryId: opened.inquiry?.id || null, inquiryCreated: opened.created },
    });
    return { request, inquiry: opened.inquiry, created: opened.created, choice };
  });
  if (result.error || result.refusal || result.skipped) return result;
  if (result.created) {
    await notifyAdmins({
      organizationId: result.request.organizationId,
      title: "طلب حجز طيران مرتبط بموافقة أمنية",
      message: `طلب ${result.request.name} حجز تذكرة الطيران عبر نسائم لطلب الموافقة ${contactRequestId}. طلب الحجز: ${result.inquiry.id}.`,
      type: "EGYPT_FLIGHT_INQUIRY_OPENED",
      contactRequestId: result.inquiry.id,
      alsoRoles: ["EMPLOYEE"],
    });
  }
  return { choice: result.choice, inquiryId: result.inquiry?.id || null, created: result.created };
}

// At submission, when the customer already chose REQUEST on the form (the
// stored answer is re-checked under the lock).
export async function openLinkedFlightInquiry(contactRequestId, { actor = "SUBMISSION" } = {}) {
  return recordFlightChoice(contactRequestId, null, "REQUEST", { actor });
}

// Repair pass (run with the travel reminders): an open request whose stored
// answer is REQUEST but has no inquiry (e.g. the process stopped right after
// the submission) gets it now.
export async function reconcileFlightInquiries({ limit = 50 } = {}) {
  const missing = await prisma.contactRequest.findMany({
    where: {
      status: { not: "CLOSED" },
      intakeData: { path: ["egyptFlight", "choice"], equals: "REQUEST" },
      linkedRequests: { none: { linkKind: FLIGHT_LINK_KIND } },
    },
    select: { id: true },
    take: limit,
  });
  let opened = 0;
  for (const { id } of missing) {
    const result = await openLinkedFlightInquiry(id, { actor: "RECONCILER" }).catch(() => null);
    if (result?.created) opened += 1;
  }
  return { opened };
}

export async function recordMyFlightChoice(phoneNormalized, contactRequestId, choice) {
  return recordFlightChoice(contactRequestId, trackingScope(phoneNormalized), choice);
}

export async function recordAccountFlightChoice(customerId, contactRequestId, choice) {
  return recordFlightChoice(contactRequestId, { customerId }, choice);
}
