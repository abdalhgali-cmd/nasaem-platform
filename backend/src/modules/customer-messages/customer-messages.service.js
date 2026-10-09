import prisma from "../../config/database.js";
import { sendWhatsAppMessage, whatsAppAvailability } from "../../utils/whatsapp.js";

// Customer-facing transactional messages with a delivery record. Today: the
// "we received your request" confirmation over WhatsApp. Each (request, kind,
// channel) has exactly one CustomerMessageDelivery row, so retrying never
// sends a second confirmation once the provider has accepted one.

export const REQUEST_CONFIRMATION = "REQUEST_CONFIRMATION";
const WHATSAPP = "WHATSAPP";

// Delivery states (CustomerMessageDelivery.status):
//   PENDING    to be sent (again) once nextAttemptAt has passed
//   SENDING    claimed by one worker right now
//   ACCEPTED   the provider accepted the message — final. Not proof that it
//              reached the phone (that needs provider status webhooks), so it
//              is never shown to anyone as "delivered".
//   UNCERTAIN  a send was started and its outcome never recorded (the process
//              died mid-send). The customer may or may not have it, so it is
//              never re-sent automatically; staff can re-send by hand.
//   FAILED     gave up after MAX_AUTO_ATTEMPTS, or too old to be useful
//   SKIPPED    nothing could be sent (WhatsApp not configured / switched off,
//              no usable number) — not retried automatically.
// A SENDING row older than this was abandoned (the provider call itself times
// out after 15 s).
const STALE_SENDING_MS = 2 * 60 * 1000;
export const MAX_AUTO_ATTEMPTS = 5;
// Wait before automatic attempt n+1 after n failed ones.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
// A "we received your request" message is pointless after this long.
const CONFIRMATION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

// Nested-create payload for ContactRequest: the confirmation is recorded as
// PENDING in the same insert as the request, so a crash right after the
// request is stored still leaves work that the reconciler picks up.
export function pendingConfirmationCreate(phoneNormalized) {
  return { create: [{ kind: REQUEST_CONFIRMATION, channel: WHATSAPP, recipient: phoneNormalized || "" }] };
}

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

function retryDelay(attempts) {
  return RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1] ?? RETRY_DELAYS_MS[0];
}

/**
 * Sends the request confirmation if it is due, and records the outcome.
 * Safe to call any number of times, concurrently and from several server
 * instances: a row is claimed atomically before sending, ACCEPTED is final.
 *
 * Automatic callers (right after submission, the reconciler) only send a
 * PENDING row that is due. `manual: true` (staff "re-send") may also send a
 * FAILED, SKIPPED or UNCERTAIN row: a person decided a possible duplicate is
 * acceptable. Returns the delivery row.
 */
export async function sendRequestConfirmation(contactRequestId, { manual = false } = {}) {
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

  // Requests stored before the outbox existed have no row yet.
  const key = { contactRequestId_kind_channel: { contactRequestId, kind: REQUEST_CONFIRMATION, channel: WHATSAPP } };
  const delivery = await prisma.customerMessageDelivery.upsert({
    where: key,
    update: {},
    create: { contactRequestId, kind: REQUEST_CONFIRMATION, channel: WHATSAPP, recipient: request.phoneNormalized || "" },
  });
  if (delivery.status === "ACCEPTED") return delivery;

  const now = new Date();
  const claimable = manual
    ? { status: { in: ["PENDING", "FAILED", "SKIPPED", "UNCERTAIN"] } }
    : { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] };

  const availability = whatsAppAvailability();
  if (availability !== "AVAILABLE" || !request.phoneNormalized) {
    await prisma.customerMessageDelivery.updateMany({
      where: { id: delivery.id, ...claimable },
      data: { status: "SKIPPED", nextAttemptAt: null, lastError: request.phoneNormalized ? availability : "NO_RECIPIENT" },
    });
    return prisma.customerMessageDelivery.findUnique({ where: { id: delivery.id } });
  }

  // Claim the row; if it isn't due or someone else is sending, leave it alone.
  const claimed = await prisma.customerMessageDelivery.updateMany({
    where: { id: delivery.id, ...claimable },
    data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: now, nextAttemptAt: null },
  });
  if (claimed.count === 0) return prisma.customerMessageDelivery.findUnique({ where: { id: delivery.id } });

  const result = await sendWhatsAppMessage(request.phoneNormalized, buildRequestConfirmationText(request));
  const { attempts } = await prisma.customerMessageDelivery.findUnique({ where: { id: delivery.id }, select: { attempts: true } });
  let data;
  if (result?.status === "ACCEPTED") {
    data = { status: "ACCEPTED", providerMessageId: result.providerMessageId, lastError: null };
  } else if (result?.status === "FAILED") {
    data =
      attempts >= MAX_AUTO_ATTEMPTS
        ? { status: "FAILED", lastError: result.error || "FAILED" }
        : { status: "PENDING", nextAttemptAt: new Date(Date.now() + retryDelay(attempts)), lastError: result.error || "FAILED" };
  } else {
    data = { status: "SKIPPED", lastError: result?.status || "UNKNOWN" };
  }
  // Only the claimant (row still SENDING) records the outcome.
  await prisma.customerMessageDelivery.updateMany({ where: { id: delivery.id, status: "SENDING" }, data });
  return prisma.customerMessageDelivery.findUnique({ where: { id: delivery.id } });
}

/**
 * Recovery pass, run periodically by the server (see server.js):
 *  1. SENDING rows abandoned by a crashed process become UNCERTAIN — never
 *     re-sent automatically, because the provider may already have taken them;
 *  2. PENDING confirmations older than CONFIRMATION_MAX_AGE_MS are given up;
 *  3. due PENDING confirmations are sent, one at a time.
 * Returns counts, for logs and tests.
 */
export async function processPendingConfirmations({ limit = 20 } = {}) {
  const now = Date.now();
  const uncertain = await prisma.customerMessageDelivery.updateMany({
    where: { kind: REQUEST_CONFIRMATION, status: "SENDING", lastAttemptAt: { lt: new Date(now - STALE_SENDING_MS) } },
    data: { status: "UNCERTAIN", lastError: "Outcome unknown: the send was interrupted" },
  });
  const expired = await prisma.customerMessageDelivery.updateMany({
    where: { kind: REQUEST_CONFIRMATION, status: "PENDING", createdAt: { lt: new Date(now - CONFIRMATION_MAX_AGE_MS) } },
    data: { status: "FAILED", nextAttemptAt: null, lastError: "EXPIRED" },
  });
  const due = await prisma.customerMessageDelivery.findMany({
    where: {
      kind: REQUEST_CONFIRMATION,
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date(now) } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { contactRequestId: true },
  });
  const outcomes = {};
  for (const row of due) {
    const result = await sendRequestConfirmation(row.contactRequestId).catch(() => null);
    const status = result?.status || "ERROR";
    outcomes[status] = (outcomes[status] || 0) + 1;
  }
  return { uncertain: uncertain.count, expired: expired.count, processed: due.length, outcomes };
}

let reconcilerTimer = null;
export function startConfirmationReconciler({ intervalMs = 60_000 } = {}) {
  if (reconcilerTimer) return;
  let running = false;
  reconcilerTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const result = await processPendingConfirmations();
      if (result.processed || result.uncertain || result.expired) console.log("[customer-messages] reconcile", JSON.stringify(result));
    } catch (error) {
      console.error("[customer-messages] reconcile failed", error?.message);
    } finally {
      running = false;
    }
  }, intervalMs);
  reconcilerTimer.unref?.();
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
    select: { id: true, kind: true, channel: true, status: true, attempts: true, providerMessageId: true, lastError: true, lastAttemptAt: true, nextAttemptAt: true, createdAt: true },
  });
}
