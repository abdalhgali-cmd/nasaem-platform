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
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";
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

export function isPaymentOpen(request) {
  return PAYMENT_OPEN_STATES.has(request.paymentStatus);
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
        approvalIssued: request.deliverables.length > 0,
      });
      liveEgyptTravel = {
        ...storedEgyptTravel,
        circularStatus: liveCircular.status,
        daysUntilEntry: liveCircular.daysUntilEntry,
      };
    }

    // Who recorded execution and their note are staff-only.
    const { executionStartedByUserId, executionNote, ...customerRequest } = request;

    return {
      ...customerRequest,
      // Internal file locations are never sent to the customer; files are
      // downloaded through the ownership-checked /file routes instead.
      documents: request.documents.map(({ storagePath, ...document }) => document),
      deliverables: request.deliverables.map(({ storagePath, ...deliverable }) => deliverable),
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
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return { error: "NOT_FOUND" };
  if (contactRequest.paymentStatus !== "AWAITING_TRANSFER") return { error: "INVALID_STATE" };

  const result = await createContactRequestDocument(contactRequestId, {
    label: "إشعار الدفع",
    file,
    classification: "FINANCIAL_DOCUMENT",
    silent: true,
  });
  if (result.error) return result;

  // The receipt is what puts the payment in front of the accountant. This only
  // moves it to "under review": it is never marked paid until staff accept it.
  await prisma.contactRequest.updateMany({
    where: { id: contactRequestId, paymentStatus: "AWAITING_TRANSFER" },
    data: { paymentStatus: "UNDER_REVIEW", paymentRejectionReason: null, paymentRejectedAt: null },
  });

  logActivity({ action: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({
    organizationId: contactRequest.organizationId,
    title: "رفع إشعار دفع جديد",
    message: `رفع ${contactRequest.name} إشعار الدفع لطلبه، بانتظار المراجعة`,
    type: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED",
    contactRequestId,
    alsoRoles: ["ACCOUNTANT"],
  });

  return result;
}

export async function getMyDocumentFile(phoneNormalized, contactRequestId, documentId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return null;
  return getContactRequestDocumentFile(contactRequestId, documentId);
}

export async function getMyDeliverableFile(phoneNormalized, contactRequestId, deliverableId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return null;
  return getContactRequestDeliverableFile(contactRequestId, deliverableId);
}

export async function approveInvoice(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest?.invoice) return { error: "NOT_FOUND" };
  if (contactRequest.invoice.status !== "PENDING") return { error: "INVALID_STATE" };
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: contactRequest.invoice.id }, data: { status: "APPROVED", decidedAt: new Date() } }),
    prisma.contactRequest.update({ where: { id: contactRequestId }, data: { paymentStatus: "AWAITING_TRANSFER" } }),
  ]);
  logActivity({ action: "CONTACT_REQUEST_INVOICE_APPROVED", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({ title: "موافقة العميل على السعر", message: `وافق ${contactRequest.name} على السعر المحدد لطلبه`, type: "CONTACT_REQUEST_INVOICE_APPROVED", contactRequestId, organizationId: contactRequest.organizationId });
  return { success: true };
}

export async function rejectInvoice(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest?.invoice) return { error: "NOT_FOUND" };
  if (contactRequest.invoice.status !== "PENDING") return { error: "INVALID_STATE" };
  await prisma.invoice.update({ where: { id: contactRequest.invoice.id }, data: { status: "REJECTED", decidedAt: new Date() } });
  logActivity({ action: "CONTACT_REQUEST_INVOICE_REJECTED", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({ title: "رفض العميل للسعر", message: `رفض ${contactRequest.name} عرض السعر المحدد لطلبه`, type: "CONTACT_REQUEST_INVOICE_REJECTED", contactRequestId, organizationId: contactRequest.organizationId });
  return { success: true };
}

export async function selectOffer(phoneNormalized, contactRequestId, offerId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return { error: "NOT_FOUND" };
  if (contactRequest.selectedOfferId) return { error: "INVALID_STATE" };
  const offer = contactRequest.offers.find((candidate) => candidate.id === offerId);
  if (!offer) return { error: "NOT_FOUND" };
  await prisma.contactRequest.update({ where: { id: contactRequestId }, data: { selectedOfferId: offerId, paymentStatus: "AWAITING_TRANSFER" } });
  logActivity({ action: "CONTACT_REQUEST_OFFER_SELECTED", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({ title: "اختيار العميل لعرض", message: `اختار ${contactRequest.name} عرض ${offer.carrier}`, type: "CONTACT_REQUEST_OFFER_SELECTED", contactRequestId, organizationId: contactRequest.organizationId });
  return { success: true };
}

export async function markTransferSent(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return { error: "NOT_FOUND" };
  // A receipt upload already moved the request to review: declaring the
  // transfer afterwards is accepted as a no-op instead of failing the customer.
  if (contactRequest.paymentStatus === "UNDER_REVIEW") return { success: true };
  if (contactRequest.paymentStatus !== "AWAITING_TRANSFER") return { error: "INVALID_STATE" };
  await prisma.contactRequest.update({ where: { id: contactRequestId }, data: { paymentStatus: "UNDER_REVIEW", paymentRejectionReason: null, paymentRejectedAt: null } });
  logActivity({ action: "CONTACT_REQUEST_TRANSFER_MARKED_SENT", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({ organizationId: contactRequest.organizationId, title: "إعلان العميل عن تحويل المبلغ", message: `أعلن ${contactRequest.name} عن تحويل المبلغ لطلبه، بانتظار التأكيد`, type: "CONTACT_REQUEST_TRANSFER_MARKED_SENT", contactRequestId, alsoRoles: ["ACCOUNTANT"] });
  return { success: true };
}
