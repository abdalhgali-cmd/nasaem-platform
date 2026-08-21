import { randomInt } from "node:crypto";
import prisma from "../../config/database.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { signTrackingToken } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";
import { deriveTrackingStatusLabel } from "./contact-request-tracking.status.js";
import {
  createContactRequestDocument,
  getContactRequestDocumentFile,
} from "../contact-request-documents/contact-request-documents.service.js";
import { getContactRequestDeliverableFile } from "../contact-request-deliverables/contact-request-deliverables.service.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function requestLoginCode(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Invalidate any still-live codes for this phone first, so only the most
  // recently requested one can ever be verified.
  await prisma.contactRequestLoginCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.contactRequestLoginCode.create({
    data: { phone, code, expiresAt },
  });

  // Not awaited: same rationale as elsewhere in the codebase (see
  // createContactRequest) — a slow/unreachable WhatsApp API must never delay
  // the response, and this silently no-ops when WHATSAPP_* env vars aren't
  // set (dev/test).
  sendWhatsAppMessage(
    phone,
    `رمز التحقق الخاص بك لتتبع طلبك: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`
  );

  return {
    // Only surfaced when NODE_ENV=test, so automated tests can complete the
    // login flow without a real WhatsApp integration configured.
    debugCode: process.env.NODE_ENV === "test" ? code : undefined,
  };
}

export async function verifyLoginCode(rawPhone, code) {
  const phone = normalizePhone(rawPhone);

  const loginCode = await prisma.contactRequestLoginCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!loginCode) {
    return { success: false, message: "رمز التحقق غير صالح أو منتهي الصلاحية" };
  }

  if (loginCode.code !== code) {
    const attempts = loginCode.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;

    await prisma.contactRequestLoginCode.update({
      where: { id: loginCode.id },
      data: {
        attempts,
        ...(exhausted ? { consumedAt: new Date() } : {}),
      },
    });

    return {
      success: false,
      message: exhausted
        ? "تم تجاوز عدد المحاولات المسموح، يرجى طلب رمز جديد"
        : "رمز التحقق غير صحيح",
    };
  }

  await prisma.contactRequestLoginCode.update({
    where: { id: loginCode.id },
    data: { consumedAt: new Date() },
  });

  return { success: true, token: signTrackingToken(phone) };
}

export async function listContactRequestsForPhone(phoneNormalized) {
  const requests = await prisma.contactRequest.findMany({
    where: { phoneNormalized },
    orderBy: { createdAt: "desc" },
    include: {
      invoice: true,
      documents: { orderBy: { createdAt: "desc" } },
      offers: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: { createdAt: "desc" } },
      serviceRef: { select: { id: true, name: true, category: true } },
      visaType: { select: { id: true, name: true, country: true } },
    },
  });

  return requests.map((request) => ({
    ...request,
    // internalNotes is staff-only context (see ContactRequestOffer schema
    // comment) — every other field on an offer is meant for the customer,
    // so this is the one that must be stripped before this reaches /track.
    offers: request.offers.map(({ internalNotes, ...offer }) => offer),
    statusLabel: deriveTrackingStatusLabel(request),
  }));
}

// Ownership check shared by every action below: a tracking session only
// ever gets to act on ContactRequests submitted with its own phone number,
// never an arbitrary id (which would otherwise let one logged-in customer
// approve/reject or mark-paid another customer's request).
async function findOwnedContactRequest(phoneNormalized, contactRequestId) {
  return prisma.contactRequest.findFirst({
    where: { id: contactRequestId, phoneNormalized },
    include: { invoice: true, offers: true },
  });
}

export async function uploadMyDocument(phoneNormalized, contactRequestId, { label, file }) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  return createContactRequestDocument(contactRequestId, { label, file });
}

export async function getMyDocumentFile(phoneNormalized, contactRequestId, documentId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest) {
    return null;
  }

  return getContactRequestDocumentFile(contactRequestId, documentId);
}

export async function getMyDeliverableFile(phoneNormalized, contactRequestId, deliverableId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest) {
    return null;
  }

  return getContactRequestDeliverableFile(contactRequestId, deliverableId);
}

export async function approveInvoice(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest?.invoice) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice.status !== "PENDING") {
    return { error: "INVALID_STATE" };
  }

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: contactRequest.invoice.id },
      data: { status: "APPROVED", decidedAt: new Date() },
    }),
    prisma.contactRequest.update({
      where: { id: contactRequestId },
      data: { paymentStatus: "AWAITING_TRANSFER" },
    }),
  ]);

  logActivity({
    action: "CONTACT_REQUEST_INVOICE_APPROVED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  await notifyAdmins({
    title: "موافقة العميل على السعر",
    message: `وافق ${contactRequest.name} على السعر المحدد لطلبه`,
    type: "CONTACT_REQUEST_INVOICE_APPROVED",
  });

  return { success: true };
}

export async function rejectInvoice(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest?.invoice) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice.status !== "PENDING") {
    return { error: "INVALID_STATE" };
  }

  await prisma.invoice.update({
    where: { id: contactRequest.invoice.id },
    data: { status: "REJECTED", decidedAt: new Date() },
  });

  logActivity({
    action: "CONTACT_REQUEST_INVOICE_REJECTED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  await notifyAdmins({
    title: "رفض العميل للسعر",
    message: `رفض ${contactRequest.name} عرض السعر المحدد لطلبه`,
    type: "CONTACT_REQUEST_INVOICE_REJECTED",
  });

  return { success: true };
}

export async function selectOffer(phoneNormalized, contactRequestId, offerId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.selectedOfferId) {
    return { error: "INVALID_STATE" };
  }

  const offer = contactRequest.offers.find((candidate) => candidate.id === offerId);

  if (!offer) {
    return { error: "NOT_FOUND" };
  }

  // A Manual Flight Offer's price is only good until validUntil — never
  // let a customer lock in a fare staff have marked as no longer available.
  if (offer.validUntil && offer.validUntil < new Date()) {
    return { error: "OFFER_EXPIRED" };
  }

  await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { selectedOfferId: offerId, paymentStatus: "AWAITING_TRANSFER" },
  });

  logActivity({
    action: "CONTACT_REQUEST_OFFER_SELECTED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  await notifyAdmins({
    title: "اختيار العميل لعرض",
    message: `اختار ${contactRequest.name} عرض ${offer.carrier}`,
    type: "CONTACT_REQUEST_OFFER_SELECTED",
  });

  return { success: true };
}

export async function markTransferSent(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.paymentStatus !== "AWAITING_TRANSFER") {
    return { error: "INVALID_STATE" };
  }

  await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { paymentStatus: "UNDER_REVIEW" },
  });

  logActivity({
    action: "CONTACT_REQUEST_TRANSFER_MARKED_SENT",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Arguably the most operationally important notification here — staff
  // need to actively go verify the bank transfer before they can confirm
  // the payment (confirmContactRequestPayment only accepts UNDER_REVIEW).
  await notifyAdmins({
    title: "إعلان العميل عن تحويل المبلغ",
    message: `أعلن ${contactRequest.name} عن تحويل المبلغ لطلبه، بانتظار التأكيد`,
    type: "CONTACT_REQUEST_TRANSFER_MARKED_SENT",
  });

  return { success: true };
}
