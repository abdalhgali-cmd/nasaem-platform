import { randomInt } from "node:crypto";
import { trackingScope } from "../../utils/publicOrganization.js";
import prisma from "../../config/database.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage, whatsAppReadiness } from "../../utils/whatsapp.js";
import { signTrackingToken } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";
import { deriveTrackingStatusLabel } from "./contact-request-tracking.status.js";
import { deriveRequestProgress } from "../contact-request-progress/request-progress.js";
import { deriveEgyptCircularStatus } from "./egypt-clearance-travel.service.js";
import {
  createContactRequestDocument,
  getContactRequestDocumentFile,
} from "../contact-request-documents/contact-request-documents.service.js";
import { getContactRequestDeliverableFile } from "../contact-request-deliverables/contact-request-deliverables.service.js";
import path from "path";
import { notifyAdmins, refreshCaseTasks } from "../contact-requests/contact-requests.service.js";
import { ACTIONS, allowedActions, checkAction, paymentLockReasons, publishedDeliverables } from "../contact-request-workflow/workflow-policy.js";
import { auditInTransaction, refuseWith, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import { buildCustomerChecklist, buildCustomerNextActions } from "./customer-checklist.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EGYPT_CLEARANCE_CODE = "VISA-EGYPT-CLEARANCE";

// Sends a one-time tracking code over WhatsApp, the only channel that proves
// possession of the phone. Never reports success for a code nobody can
// receive:
//   - WhatsApp not configured / switched off → OTP_CHANNEL_UNAVAILABLE, and
//     no code is created (except in test/development, below);
//   - Meta refuses or is unreachable → the code is withdrawn, OTP_DELIVERY_FAILED.
// "ACCEPTED" means Meta took the message, not that it reached the handset;
// the reply wording says so.
export async function requestLoginCode(rawPhone) {
  const phone = normalizePhone(rawPhone);
  // Exposed only under "test" (CI/local test runs) and "development" (local
  // `npm run dev`, no WhatsApp provider configured) — never in "production",
  // where NODE_ENV is always "production" and this stays undefined. Lets a
  // developer complete the tracking OTP flow against localhost without a
  // real WhatsApp/SMS provider.
  const isDebugOtpAllowed = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";
  const channel = await whatsAppReadiness();
  if (channel !== "AVAILABLE" && !isDebugOtpAllowed) {
    return { error: "OTP_CHANNEL_UNAVAILABLE", channel };
  }

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.contactRequestLoginCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const loginCode = await prisma.contactRequestLoginCode.create({ data: { phone, code, expiresAt } });

  if (channel !== "AVAILABLE") {
    return { delivery: "DEBUG_ONLY", debugCode: code };
  }
  const outcome = await sendWhatsAppMessage(phone, `رمز التحقق الخاص بك لتتبع طلبك: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`);
  if (outcome.status !== "ACCEPTED") {
    // Nobody can have received it: withdraw it so it can't be guessed later.
    await prisma.contactRequestLoginCode.update({ where: { id: loginCode.id }, data: { consumedAt: new Date() } });
    console.error("Tracking OTP not sent:", outcome.status, outcome.error || "");
    return { error: "OTP_DELIVERY_FAILED", channel: outcome.status };
  }
  return { delivery: "ACCEPTED", debugCode: isDebugOtpAllowed ? code : undefined };
}

export async function verifyLoginCode(rawPhone, code) {
  const phone = normalizePhone(rawPhone);
  const loginCode = await prisma.contactRequestLoginCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!loginCode) return { success: false, message: "رمز التحقق غير صالح أو منتهي الصلاحية" };
  if (loginCode.code !== code) {
    const attempts = loginCode.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    await prisma.contactRequestLoginCode.update({
      where: { id: loginCode.id },
      data: { attempts, ...(exhausted ? { consumedAt: new Date() } : {}) },
    });
    return { success: false, message: exhausted ? "تم تجاوز عدد المحاولات المسموح، يرجى طلب رمز جديد" : "رمز التحقق غير صحيح" };
  }
  await prisma.contactRequestLoginCode.update({ where: { id: loginCode.id }, data: { consumedAt: new Date() } });
  return { success: true, token: signTrackingToken(phone) };
}

const PAYMENT_OPEN_STATES = new Set(["AWAITING_TRANSFER", "UNDER_REVIEW"]);

// A fixed price whose payment waits for the document review is not open
// yet: no bank accounts are shown until the documents are approved.
export function isPaymentOpen(request) {
  return PAYMENT_OPEN_STATES.has(request.paymentStatus) && paymentLockReasons(request).length === 0;
}

// Accounts for one currency, only to a phone that owns a request whose price it
// has approved in that currency (never a general "list the bank accounts").
export async function listPaymentAccountsForPhone(phoneNormalized, currency) {
  const requests = await prisma.contactRequest.findMany({
    where: { ...trackingScope(phoneNormalized), paymentStatus: { in: [...PAYMENT_OPEN_STATES] } },
    include: { invoice: { select: { currency: true } }, offers: { select: { id: true, currency: true } } },
  });
  const allowed = new Set(
    requests
      .map((request) => request.invoice?.currency || request.offers.find((offer) => offer.id === request.selectedOfferId)?.currency)
      .filter(Boolean)
  );
  const wanted = currency ? String(currency).toUpperCase() : null;
  const currencies = wanted ? [...allowed].filter((code) => code === wanted) : [...allowed];
  if (!currencies.length) return [];
  return prisma.paymentAccount.findMany({
    where: { active: true, currency: { in: currencies } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, bankName: true, accountName: true, accountNumber: true, iban: true, currency: true },
  });
}

export async function listContactRequestsForPhone(phoneNormalized) {
  const requests = await prisma.contactRequest.findMany({
    // Scoped server-side to the public organization (utils/publicOrganization.js).
    where: trackingScope(phoneNormalized),
    orderBy: { createdAt: "desc" },
    include: {
      invoice: true,
      documents: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: { createdAt: "desc" } },
      offers: { orderBy: { createdAt: "desc" } },
      travelers: { orderBy: { sortOrder: "asc" } },
      serviceRef: { select: { id: true, name: true, category: true } },
      visaType: { select: { id: true, code: true, name: true, country: true, category: true } },
      // For the completion policy only (Egypt travel tasks); not sent to the customer.
      tasks: { where: { status: "OPEN", source: "SYSTEM" }, select: { id: true, title: true, status: true, source: true, systemKey: true } },
    },
  });

  // Payment accounts are shown only once the customer has approved the
  // agency's price (a request waiting for, or under review of, a transfer).
  const currencies = [...new Set(
    requests
      .filter(isPaymentOpen)
      .map((request) => request.invoice?.currency || request.offers.find((offer) => offer.id === request.selectedOfferId)?.currency)
      .filter(Boolean)
  )];

  const paymentAccounts = currencies.length
    ? await prisma.paymentAccount.findMany({
        where: { active: true, currency: { in: currencies } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, bankName: true, accountName: true, accountNumber: true, iban: true, currency: true },
      })
    : [];

  return requests.map((request) => {
    const selectedOffer = request.offers.find((offer) => offer.id === request.selectedOfferId);
    const paymentCurrency = request.invoice?.currency || selectedOffer?.currency || null;
    const checklist = buildCustomerChecklist(request);

    const storedEgyptTravel = request.intakeData?.egyptTravel || null;
    let liveEgyptTravel = storedEgyptTravel;
    if (
      request.visaType?.code === EGYPT_CLEARANCE_CODE &&
      storedEgyptTravel?.entryDate &&
      storedEgyptTravel?.bookingStatus
    ) {
      const liveCircular = deriveEgyptCircularStatus({
        entryDate: storedEgyptTravel.entryDate,
        bookingStatus: storedEgyptTravel.bookingStatus,
        approvalIssued: publishedDeliverables(request).length > 0,
      });
      liveEgyptTravel = {
        ...storedEgyptTravel,
        circularStatus: liveCircular.status,
        daysUntilEntry: liveCircular.daysUntilEntry,
      };
    }

    // Who recorded execution and their note are staff-only.
    const { executionStartedByUserId, executionNote, tasks, ...customerRequest } = request;

    return {
      ...customerRequest,
      // Internal file locations are never sent to the customer; files are
      // downloaded through the ownership-checked /file routes instead.
      documents: request.documents.map(({ storagePath, ...document }) => document),
      // Prepared (draft) files are staff-only until published.
      deliverables: publishedDeliverables(request).map(({ storagePath, uploadedByUserId, publishedByUserId, ...deliverable }) => deliverable),
      allowedActions: allowedActions(request, { audience: "customer" }),
      intakeData: request.intakeData
        ? { ...request.intakeData, ...(liveEgyptTravel ? { egyptTravel: liveEgyptTravel } : {}) }
        : request.intakeData,
      checklist,
      nextActions: buildCustomerNextActions(request, checklist),
      statusLabel: deriveTrackingStatusLabel(request),
      progress: deriveRequestProgress(request),
      paymentCurrency,
      paymentAccounts: paymentCurrency && isPaymentOpen(request)
        ? paymentAccounts.filter((account) => account.currency === paymentCurrency)
        : [],
      paymentRejection: request.paymentStatus === "AWAITING_TRANSFER" && request.paymentRejectionReason
        ? { reason: request.paymentRejectionReason, at: request.paymentRejectedAt }
        : null,
    };
  });
}

async function findOwnedContactRequest(phoneNormalized, contactRequestId) {
  return prisma.contactRequest.findFirst({
    where: { id: contactRequestId, ...trackingScope(phoneNormalized) },
    include: { invoice: true, offers: true },
  });
}

export async function uploadMyDocument(phoneNormalized, contactRequestId, { label, file, requirementId, travelerId }) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return { error: "NOT_FOUND" };
  return createContactRequestDocument(contactRequestId, { label, file, requirementId, travelerId });
}

export async function uploadPaymentReceipt(phoneNormalized, contactRequestId, file) {
  // The receipt is what puts the payment in front of the accountant. This only
  // moves it to "under review": it is never marked paid until staff accept it.
  const result = await withLockedRequest(contactRequestId, trackingScope(phoneNormalized), async (tx, request) => {
    const refusal = checkAction(ACTIONS.UPLOAD_RECEIPT, request);
    if (refusal) refuseWith(refusal);
    const document = await tx.contactRequestDocument.create({
      data: {
        contactRequestId,
        label: "إشعار الدفع",
        classification: "FINANCIAL_DOCUMENT",
        fileName: file.originalname,
        storagePath: path.join("contact-request-documents", file.filename),
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { paymentStatus: "UNDER_REVIEW", paymentRejectionReason: null, paymentRejectedAt: null },
    });
    await auditInTransaction(tx, { action: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED", entityId: contactRequestId, organizationId: request.organizationId });
    return { document, request };
  });
  if (result.error || result.refusal) return result;

  await notifyAdmins({
    organizationId: result.request.organizationId,
    title: "رفع إشعار دفع جديد",
    message: `رفع ${result.request.name} إشعار الدفع لطلبه، بانتظار المراجعة`,
    type: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED",
    contactRequestId,
    alsoRoles: ["ACCOUNTANT"],
  });
  await refreshCaseTasks(contactRequestId);
  return { document: result.document };
}

export async function getMyDocumentFile(phoneNormalized, contactRequestId, documentId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return null;
  return getContactRequestDocumentFile(contactRequestId, documentId);
}

export async function getMyDeliverableFile(phoneNormalized, contactRequestId, deliverableId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return null;
  return getContactRequestDeliverableFile(contactRequestId, deliverableId, { publishedOnly: true });
}

// Customer decisions on a price. Each runs under the request's row lock, so
// a price revised or a request closed by staff in the meantime is seen and
// refused (QUOTE_CHANGED / REQUEST_CLOSED) instead of being approved blind.
export async function approveInvoice(phoneNormalized, contactRequestId, { invoiceVersion } = {}) {
  const result = await withLockedRequest(contactRequestId, trackingScope(phoneNormalized), async (tx, request) => {
    if (!request.invoice) return { error: "NOT_FOUND" };
    const refusal = checkAction(ACTIONS.APPROVE_QUOTE, request, { invoiceVersion });
    if (refusal) refuseWith(refusal);
    await tx.invoice.update({ where: { id: request.invoice.id }, data: { status: "APPROVED", decidedAt: new Date() } });
    await tx.contactRequest.update({ where: { id: contactRequestId }, data: { paymentStatus: "AWAITING_TRANSFER" } });
    await auditInTransaction(tx, { action: "CONTACT_REQUEST_INVOICE_APPROVED", entityId: contactRequestId, organizationId: request.organizationId, newValue: { amount: request.invoice.amount, currency: request.invoice.currency } });
    return { request };
  });
  if (result.error || result.refusal) return result;
  await notifyAdmins({ title: "موافقة العميل على السعر", message: `وافق ${result.request.name} على السعر المحدد لطلبه`, type: "CONTACT_REQUEST_INVOICE_APPROVED", contactRequestId, organizationId: result.request.organizationId });
  return { success: true };
}

export async function rejectInvoice(phoneNormalized, contactRequestId, { invoiceVersion } = {}) {
  const result = await withLockedRequest(contactRequestId, trackingScope(phoneNormalized), async (tx, request) => {
    if (!request.invoice) return { error: "NOT_FOUND" };
    const refusal = checkAction(ACTIONS.REJECT_QUOTE, request, { invoiceVersion });
    if (refusal) refuseWith(refusal);
    await tx.invoice.update({ where: { id: request.invoice.id }, data: { status: "REJECTED", decidedAt: new Date() } });
    await auditInTransaction(tx, { action: "CONTACT_REQUEST_INVOICE_REJECTED", entityId: contactRequestId, organizationId: request.organizationId });
    return { request };
  });
  if (result.error || result.refusal) return result;
  await notifyAdmins({ title: "رفض العميل للسعر", message: `رفض ${result.request.name} عرض السعر المحدد لطلبه`, type: "CONTACT_REQUEST_INVOICE_REJECTED", contactRequestId, organizationId: result.request.organizationId });
  return { success: true };
}

export async function selectOffer(phoneNormalized, contactRequestId, offerId) {
  const result = await withLockedRequest(contactRequestId, trackingScope(phoneNormalized), async (tx, request) => {
    const offer = request.offers.find((candidate) => candidate.id === offerId);
    if (!offer) return { error: "NOT_FOUND" };
    const refusal = checkAction(ACTIONS.SELECT_OFFER, request);
    if (refusal) refuseWith(refusal);
    await tx.contactRequest.update({ where: { id: contactRequestId }, data: { selectedOfferId: offerId, paymentStatus: "AWAITING_TRANSFER" } });
    await auditInTransaction(tx, { action: "CONTACT_REQUEST_OFFER_SELECTED", entityId: contactRequestId, organizationId: request.organizationId, newValue: { offerId } });
    return { request, offer };
  });
  if (result.error || result.refusal) return result;
  await notifyAdmins({ title: "اختيار العميل لعرض", message: `اختار ${result.request.name} عرض ${result.offer.carrier}`, type: "CONTACT_REQUEST_OFFER_SELECTED", contactRequestId, organizationId: result.request.organizationId });
  return { success: true };
}

export async function markTransferSent(phoneNormalized, contactRequestId) {
  const result = await withLockedRequest(contactRequestId, trackingScope(phoneNormalized), async (tx, request) => {
    // A receipt upload already moved the request to review: declaring the
    // transfer afterwards is an idempotent repeat, not a failure.
    if (request.status !== "CLOSED" && request.paymentStatus === "UNDER_REVIEW") return { repeat: true };
    const refusal = checkAction(ACTIONS.DECLARE_TRANSFER, request);
    if (refusal) refuseWith(refusal);
    await tx.contactRequest.update({ where: { id: contactRequestId }, data: { paymentStatus: "UNDER_REVIEW", paymentRejectionReason: null, paymentRejectedAt: null } });
    await auditInTransaction(tx, { action: "CONTACT_REQUEST_TRANSFER_MARKED_SENT", entityId: contactRequestId, organizationId: request.organizationId });
    return { request };
  });
  if (result.error || result.refusal) return result;
  if (result.repeat) return { success: true };
  await notifyAdmins({ organizationId: result.request.organizationId, title: "إعلان العميل عن تحويل المبلغ", message: `أعلن ${result.request.name} عن تحويل المبلغ لطلبه، بانتظار التأكيد`, type: "CONTACT_REQUEST_TRANSFER_MARKED_SENT", contactRequestId, alsoRoles: ["ACCOUNTANT"] });
  return { success: true };
}
