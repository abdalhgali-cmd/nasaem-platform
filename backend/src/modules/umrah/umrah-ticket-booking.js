import { trackingScope } from "../../utils/publicOrganization.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";
import { auditInTransaction, refuseWith, sendRefusal, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import { isUmrahRequest, umrahTicketBooking, UMRAH_TICKET_LINK } from "./umrah-delivery.js";

// Optional follow-up, never a prerequisite for visa issuance or completion.
// The parent's row lock and (parentRequestId, linkKind) unique constraint make
// a retry or concurrent double tap return the same ordinary quoted inquiry.
export async function requestUmrahTickets(id, scope) {
  const result = await withLockedRequest(id, scope, async (tx, parent) => {
    const booking = umrahTicketBooking(parent);
    if (!isUmrahRequest(parent) || ["CANCELLED", "REJECTED"].includes(parent.outcome)) {
      refuseWith({ status: 409, code: "UMRAH_BOOKING_UNAVAILABLE", message: "طلب حجز التذاكر غير متاح لهذه الحالة." });
    }
    if (booking.inquiryId) return { inquiryId: booking.inquiryId, created: false };
    if (!booking.available) refuseWith({ status: 409, code: "VISAS_NOT_ISSUED", message: "يمكن طلب حجز التذاكر بعد إصدار تأشيرات المعتمرين." });
    const service = await tx.service.findUnique({ where: { code: booking.mode === "SEA" ? "SVC-FERRY" : "SVC-FLIGHT" }, select: { id: true, name: true } });
    if (!service) refuseWith({ status: 409, code: "BOOKING_SERVICE_UNAVAILABLE", message: "خدمة الحجز غير متاحة الآن؛ تواصل مع الوكالة." });
    const inquiry = await tx.contactRequest.create({
      data: {
        organizationId: parent.organizationId, customerId: parent.customerId,
        name: parent.name, phone: parent.phone, phoneNormalized: parent.phoneNormalized, email: parent.email,
        serviceId: service.id, service: service.name, requestKind: "SERVICE_APPLICATION", pricingMode: "QUOTE",
        message: `طلب حجز تذاكر ${booking.mode === "SEA" ? "البحر" : "الطيران"} اختياري بعد إصدار تأشيرات طلب العمرة ${parent.id}. السعر والحجز يؤكدهما موظف الوكالة.`,
        parentRequestId: parent.id, linkKind: UMRAH_TICKET_LINK,
        intakeData: { linkedFrom: parent.id, mode: booking.mode },
        travelerCount: parent.travelers.length,
        travelers: { create: parent.travelers.map((t, index) => ({ fullName: t.fullName, isPrimary: index === 0, sortOrder: index })) },
      },
      select: { id: true },
    });
    await auditInTransaction(tx, { action: "UMRAH_TICKET_INQUIRY_OPENED", entityId: id, organizationId: parent.organizationId, newValue: { inquiryId: inquiry.id, mode: booking.mode } });
    return { inquiryId: inquiry.id, created: true, organizationId: parent.organizationId };
  });
  if (result.created) await notifyAdmins({ organizationId: result.organizationId, title: "طلب حجز تذاكر بعد إصدار تأشيرة العمرة", message: `طلب حجز مرتبط بالعمرة ${id}، للتسعير والمتابعة.`, type: "UMRAH_TICKET_INQUIRY_OPENED", contactRequestId: result.inquiryId, alsoRoles: ["EMPLOYEE"] });
  return result;
}

async function answer(req, res, next, scope) {
  try {
    const result = await requestUmrahTickets(req.params.id, scope);
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "الطلب غير موجود" });
    if (result.refusal) return sendRefusal(res, result.refusal);
    return res.status(result.created ? 201 : 200).json({ success: true, data: { inquiryId: result.inquiryId, created: result.created } });
  } catch (error) { next(error); }
}

export const postTrackedUmrahTickets = (req, res, next) => answer(req, res, next, trackingScope(req.trackingPhone));
export const postAccountUmrahTickets = (req, res, next) => answer(req, res, next, { customerId: req.customer.id });
