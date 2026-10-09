import prisma from "../../config/database.js";
import { sendWhatsAppMessage, whatsAppAvailability } from "../../utils/whatsapp.js";

// Customer-facing transactional messages with a delivery record. Today: the
// "we received your request" confirmation over WhatsApp. Each (request, kind,
// channel) has exactly one CustomerMessageDelivery row, so retrying never
// sends a second confirmation once the provider has accepted one.

export const REQUEST_CONFIRMATION = "REQUEST_CONFIRMATION";
const WHATSAPP = "WHATSAPP";
// A SENDING row older than this is treated as abandoned (process crashed
// mid-send) and may be claimed again.
const STALE_SENDING_MS = 2 * 60 * 1000;

function serviceName(request) {
  return request.serviceRef?.name || request.visaType?.name || request.service || "خدمة سفر";
}

// Deliberately minimal: reference + service only. Never passports,
// documents, OTPs, prices or links carrying tokens.
export function buildRequestConfirmationText(request) {
  return [
    `نسائم الحرمين: تم استلام طلبك (${serviceName(request)}).`,
    `الرقم المرجعي: ${request.id}`,
    "سيتواصل معك فريقنا عند وجود تحديث، ويمكنك متابعة طلبك من التطبيق أو الموقع برقم هاتفك.",
  ].join("\n");
}

/**
 * Sends (or re-sends after a failure) the request confirmation and records
 * the outcome. Safe to call any number of times, concurrently included:
 * a row is claimed atomically before sending, and an ACCEPTED row is final.
 * Returns the delivery row.
 */
export async function sendRequestConfirmation(contactRequestId) {
  const request = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: {
      id: true,
      phoneNormalized: true,
      service: true,
      serviceRef: { select: { name: true } },
      visaType: { select: { name: true } },
    },
  });
  if (!request) return null;

  const key = { contactRequestId_kind_channel: { contactRequestId, kind: REQUEST_CONFIRMATION, channel: WHATSAPP } };
  const delivery = await prisma.customerMessageDelivery.upsert({
    where: key,
    update: {},
    create: { contactRequestId, kind: REQUEST_CONFIRMATION, channel: WHATSAPP, recipient: request.phoneNormalized || "" },
  });
  if (delivery.status === "ACCEPTED") return delivery;

  const availability = whatsAppAvailability();
  if (availability !== "AVAILABLE" || !request.phoneNormalized) {
    return prisma.customerMessageDelivery.update({
      where: { id: delivery.id },
      data: { status: "SKIPPED", lastError: request.phoneNormalized ? availability : "NO_RECIPIENT" },
    });
  }

  // Claim the row; if another caller is sending right now, leave it alone.
  const claimed = await prisma.customerMessageDelivery.updateMany({
    where: {
      id: delivery.id,
      OR: [
        { status: { in: ["PENDING", "FAILED", "SKIPPED"] } },
        { status: "SENDING", lastAttemptAt: { lt: new Date(Date.now() - STALE_SENDING_MS) } },
      ],
    },
    data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) return prisma.customerMessageDelivery.findUnique({ where: { id: delivery.id } });

  const result = await sendWhatsAppMessage(request.phoneNormalized, buildRequestConfirmationText(request));
  return prisma.customerMessageDelivery.update({
    where: { id: delivery.id },
    data:
      result?.status === "ACCEPTED"
        ? { status: "ACCEPTED", providerMessageId: result.providerMessageId, lastError: null }
        : { status: result?.status === "FAILED" ? "FAILED" : "SKIPPED", lastError: result?.error || result?.status || "UNKNOWN" },
  });
}

// What the submitting customer can honestly be told right after submitting:
// whether a confirmation is being attempted, never that it was delivered.
export function confirmationOutlook() {
  return whatsAppAvailability() === "AVAILABLE" ? "QUEUED" : "NOT_AVAILABLE";
}

export async function listCustomerMessages(contactRequestId) {
  return prisma.customerMessageDelivery.findMany({
    where: { contactRequestId },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, channel: true, status: true, attempts: true, providerMessageId: true, lastError: true, lastAttemptAt: true, createdAt: true },
  });
}
