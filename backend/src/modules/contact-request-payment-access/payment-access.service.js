// Request-scoped payment access: the customer who has just submitted a request
// at an accepted fixed price goes straight to its payment step (amount, the
// agency's account in that currency, transfer receipt) without a separate
// phone-code sign-in.
//
// The token is random, returned once in the creation response, stored only as
// a SHA-256 hash, expires, and opens nothing but this one request's payment
// summary and receipt upload. Everything else about the request (documents,
// deliverables, other requests of the same phone) stays behind tracking.
//
// A receipt only moves the payment to UNDER_REVIEW («بانتظار مراجعة
// التحويل»); staff confirm it (contact-requests.service.js
// confirmContactRequestPayment), never this module.
import { createHash, randomBytes } from "node:crypto";
import prisma from "../../config/database.js";
import { WORKFLOW_INCLUDE } from "../contact-request-workflow/workflow-lock.js";
import { paymentLockReasons } from "../contact-request-workflow/workflow-policy.js";
import { deriveTrackingStatusLabel } from "../contact-request-tracking/contact-request-tracking.status.js";
import { recordPaymentReceipt } from "../contact-request-tracking/contact-request-tracking.service.js";
import { loadSettlementOptions } from "../payment-settlement/payment-settlement.service.js";

export const PAYMENT_ACCESS_TTL_MS = 72 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export const PAYMENT_STATUS_LABELS = Object.freeze({
  AWAITING_TRANSFER: "بانتظار التحويل",
  UNDER_REVIEW: "بانتظار مراجعة الدفع",
  CONFIRMED: "تم تأكيد السداد",
  NOT_REQUIRED: "لا يتطلب دفعًا",
});

export function hashPaymentAccessToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function isWellFormedPaymentToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

function accessScope(token, now = new Date()) {
  return { paymentAccessTokenHash: hashPaymentAccessToken(token), paymentAccessExpiresAt: { gt: now } };
}

// Only a request created at an accepted fixed price has a payment to make
// right away (its approved invoice exists from the start). A quoted request
// is paid later, after the customer approves the agency's quote in tracking.
export function qualifiesForPaymentAccess(request) {
  return request?.pricingMode === "FIXED" && ["AWAITING_TRANSFER", "UNDER_REVIEW"].includes(request.paymentStatus);
}

// Issues (or, for a retried submission, replaces) the request's token.
// Returns null when the request has nothing to pay now.
export async function issuePaymentAccess(contactRequestId, now = new Date()) {
  const request = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: { id: true, pricingMode: true, paymentStatus: true },
  });
  if (!qualifiesForPaymentAccess(request)) return null;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + PAYMENT_ACCESS_TTL_MS);
  await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { paymentAccessTokenHash: hashPaymentAccessToken(token), paymentAccessExpiresAt: expiresAt },
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

async function findWithToken(contactRequestId, token) {
  if (!isWellFormedPaymentToken(token)) return null;
  return prisma.contactRequest.findFirst({
    where: { id: contactRequestId, ...accessScope(token) },
    include: WORKFLOW_INCLUDE,
  });
}

// What the payment step shows: the amount and currency the customer accepted,
// the agency's active accounts for that currency (only while payment is open),
// and the request's current request/payment status.
export async function getPaymentAccessSummary(contactRequestId, token) {
  const request = await findWithToken(contactRequestId, token);
  if (!request) return { error: "NOT_FOUND" };
  const invoice = request.invoice && request.invoice.status === "APPROVED" ? request.invoice : null;
  const locks = request.status === "CLOSED" ? [] : paymentLockReasons(request);
  const open = Boolean(invoice) && request.status !== "CLOSED" && locks.length === 0 && request.paymentStatus === "AWAITING_TRANSFER";
  // Every way the agency accepts this invoice now: its own currency, and the
  // frozen SDG equivalent into an account the agency marked for it.
  const settlementOptions = open ? await loadSettlementOptions(prisma, invoice) : [];
  // Kept for app versions that read `accounts` (invoice currency only).
  const accounts = settlementOptions
    .filter((option) => option.kind === "INVOICE_CURRENCY")
    .map(({ id, name, bankName, accountName, accountNumber, iban, currency }) => ({ id, name, bankName, accountName, accountNumber, iban, currency }));
  return {
    data: {
      id: request.id,
      service: request.service,
      // Allows a resumed payment screen to restore the correct service
      // stepper from the authenticated request-scoped payment link.
      // Only a public catalog code is returned; no tracking details leak.
      visaTypeCode: request.visaType?.code || null,
      statusLabel: deriveTrackingStatusLabel(request),
      paymentStatus: request.paymentStatus,
      paymentStatusLabel: PAYMENT_STATUS_LABELS[request.paymentStatus] || request.paymentStatus,
      amount: invoice ? String(invoice.amount) : null,
      currency: invoice?.currency ?? null,
      amountSdg: invoice?.amountSdg != null ? String(invoice.amountSdg) : null,
      paymentOpen: open,
      lockReasons: locks.map((reason) => reason.message),
      rejectionReason: request.paymentStatus === "AWAITING_TRANSFER" ? request.paymentRejectionReason || null : null,
      accounts,
      settlementOptions,
      invoiceVersion: invoice?.version ?? null,
      exchangeRateToSdg: invoice?.exchangeRateToSdg != null ? String(invoice.exchangeRateToSdg) : null,
      expiresAt: request.paymentAccessExpiresAt?.toISOString() ?? null,
    },
  };
}

export async function uploadReceiptWithPaymentAccess(contactRequestId, token, file, settlementChoice = {}) {
  if (!isWellFormedPaymentToken(token)) return { error: "NOT_FOUND" };
  return recordPaymentReceipt(contactRequestId, accessScope(token), file, settlementChoice);
}
