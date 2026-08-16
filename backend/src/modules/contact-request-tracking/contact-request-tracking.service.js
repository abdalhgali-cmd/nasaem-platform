import { randomInt } from "node:crypto";
import prisma from "../../config/database.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { signTrackingToken } from "../../utils/jwt.js";
import { deriveTrackingStatusLabel } from "./contact-request-tracking.status.js";
import {
  createContactRequestDocument,
  getContactRequestDocumentFile,
} from "../contact-request-documents/contact-request-documents.service.js";

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
    include: { invoice: true, documents: { orderBy: { createdAt: "desc" } } },
  });

  return requests.map((request) => ({
    ...request,
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
    include: { invoice: true },
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

  return { success: true };
}
