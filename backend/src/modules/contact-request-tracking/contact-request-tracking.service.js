import { randomInt } from "node:crypto";
import prisma from "../../config/database.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { signTrackingToken } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";
import { deriveTrackingStatusLabel } from "./contact-request-tracking.status.js";
import { deriveEgyptCircularStatus } from "./egypt-clearance-travel.service.js";
import {
  createContactRequestDocument,
  getContactRequestDocumentFile,
} from "../contact-request-documents/contact-request-documents.service.js";
import { getContactRequestDeliverableFile } from "../contact-request-deliverables/contact-request-deliverables.service.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";
import { buildCustomerChecklist, buildCustomerNextActions } from "./customer-checklist.js";
import { getCurrencyRates } from "../flights/flights.service.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EGYPT_CLEARANCE_CODE = "VISA-EGYPT-CLEARANCE";

export async function requestLoginCode(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.contactRequestLoginCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.contactRequestLoginCode.create({ data: { phone, code, expiresAt } });
  sendWhatsAppMessage(phone, `رمز التحقق الخاص بك لتتبع طلبك: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`);
  // Exposed only under "test" (CI/local test runs) and "development" (local
  // `npm run dev`, no WhatsApp provider configured) — never in "production",
  // where NODE_ENV is always "production" and this stays undefined. Lets a
  // developer complete the tracking OTP flow against localhost without a
  // real WhatsApp/SMS provider.
  const isDebugOtpAllowed = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";
  return { debugCode: isDebugOtpAllowed ? code : undefined };
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

export async function listContactRequestsForPhone(phoneNormalized) {
  const requests = await prisma.contactRequest.findMany({
    where: { phoneNormalized },
    orderBy: { createdAt: "desc" },
    include: {
      invoice: true,
      documents: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: { createdAt: "desc" } },
      offers: { orderBy: { createdAt: "desc" } },
      travelers: { orderBy: { sortOrder: "asc" } },
      serviceRef: { select: { id: true, name: true, category: true } },
      visaType: { select: { id: true, code: true, name: true, country: true } },
    },
  });

  const baseCurrencies = requests
    .map((request) => request.invoice?.currency || request.offers.find((offer) => offer.id === request.selectedOfferId)?.currency)
    .filter(Boolean)
    .map((currency) => String(currency).toUpperCase());
  const currencies = [...new Set([...baseCurrencies, ...(baseCurrencies.some((currency) => currency !== "SDG") ? ["SDG"] : [])])];
  const rates = await getCurrencyRates();

  const paymentAccounts = currencies.length
    ? await prisma.paymentAccount.findMany({
        where: { active: true, currency: { in: currencies } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, bankName: true, accountName: true, accountNumber: true, iban: true, currency: true },
      })
    : [];

  return requests.map((request) => {
    const selectedOffer = request.offers.find((offer) => offer.id === request.selectedOfferId);
    const baseCurrency = String(request.invoice?.currency || selectedOffer?.currency || "").toUpperCase() || null;
    const baseAmountRaw = request.invoice?.amount ?? selectedOffer?.amount ?? null;
    const baseAmount = baseAmountRaw == null ? null : Number(baseAmountRaw);
    const preferredCurrency = String(request.intakeData?.paymentCurrencyChoice || "").toUpperCase();
    const canConvertToSdg = Boolean(baseCurrency && baseCurrency !== "SDG" && Number(rates[baseCurrency] || 0) > 0);
    const paymentOptions = baseCurrency
      ? [...new Set([baseCurrency, ...(baseCurrency !== "SDG" && canConvertToSdg ? ["SDG"] : [])])]
      : [];
    const paymentCurrency = paymentOptions.includes(preferredCurrency) ? preferredCurrency : baseCurrency;
    const paymentFxRate = paymentCurrency === "SDG" && baseCurrency && baseCurrency !== "SDG"
      ? Number(rates[baseCurrency] || 0) || null
      : paymentCurrency === baseCurrency
        ? 1
        : null;
    const paymentAmount = baseAmount == null
      ? null
      : paymentCurrency === "SDG" && baseCurrency !== "SDG"
        ? (paymentFxRate ? baseAmount * paymentFxRate : null)
        : baseAmount;
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

    return {
      ...request,
      intakeData: request.intakeData
        ? { ...request.intakeData, ...(liveEgyptTravel ? { egyptTravel: liveEgyptTravel } : {}) }
        : request.intakeData,
      checklist,
      nextActions: buildCustomerNextActions(request, checklist),
      statusLabel: deriveTrackingStatusLabel(request),
      paymentCurrency,
      paymentAmount,
      paymentBaseAmount: baseAmount,
      paymentBaseCurrency: baseCurrency,
      paymentFxRate,
      paymentOptions,
      paymentAccounts: paymentCurrency
        ? paymentAccounts.filter((account) => String(account.currency).toUpperCase() === paymentCurrency)
        : [],
    };
  });
}

async function findOwnedContactRequest(phoneNormalized, contactRequestId) {
  return prisma.contactRequest.findFirst({
    where: { id: contactRequestId, phoneNormalized },
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
  });

  logActivity({ action: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({
    title: "رفع إشعار دفع جديد",
    message: `رفع ${contactRequest.name} إشعار الدفع لطلبه، بانتظار المراجعة`,
    type: "CONTACT_REQUEST_PAYMENT_RECEIPT_UPLOADED",
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
  await notifyAdmins({ title: "موافقة العميل على السعر", message: `وافق ${contactRequest.name} على السعر المحدد لطلبه`, type: "CONTACT_REQUEST_INVOICE_APPROVED" });
  return { success: true };
}

export async function rejectInvoice(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest?.invoice) return { error: "NOT_FOUND" };
  if (contactRequest.invoice.status !== "PENDING") return { error: "INVALID_STATE" };
  await prisma.invoice.update({ where: { id: contactRequest.invoice.id }, data: { status: "REJECTED", decidedAt: new Date() } });
  logActivity({ action: "CONTACT_REQUEST_INVOICE_REJECTED", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({ title: "رفض العميل للسعر", message: `رفض ${contactRequest.name} عرض السعر المحدد لطلبه`, type: "CONTACT_REQUEST_INVOICE_REJECTED" });
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
  await notifyAdmins({ title: "اختيار العميل لعرض", message: `اختار ${contactRequest.name} عرض ${offer.carrier}`, type: "CONTACT_REQUEST_OFFER_SELECTED" });
  return { success: true };
}


export async function choosePaymentCurrency(phoneNormalized, contactRequestId, currency) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return { error: "NOT_FOUND" };
  if (contactRequest.paymentStatus !== "AWAITING_TRANSFER") return { error: "INVALID_STATE" };

  const selectedOffer = contactRequest.offers.find((offer) => offer.id === contactRequest.selectedOfferId);
  const baseCurrency = String(contactRequest.invoice?.currency || selectedOffer?.currency || "").toUpperCase();
  if (!baseCurrency) return { error: "INVALID_STATE" };

  const normalized = String(currency || "").toUpperCase();
  const rates = await getCurrencyRates();
  const allowed = new Set([baseCurrency]);
  if (baseCurrency !== "SDG" && Number(rates[baseCurrency] || 0) > 0) allowed.add("SDG");
  if (!allowed.has(normalized)) return { error: "INVALID_CURRENCY" };

  const intakeData = contactRequest.intakeData && typeof contactRequest.intakeData === "object"
    ? contactRequest.intakeData
    : {};
  await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { intakeData: { ...intakeData, paymentCurrencyChoice: normalized } },
  });
  logActivity({ action: "CONTACT_REQUEST_PAYMENT_CURRENCY_SELECTED", entity: "ContactRequest", entityId: contactRequestId });
  return { success: true, currency: normalized };
}

export async function markTransferSent(phoneNormalized, contactRequestId) {
  const contactRequest = await findOwnedContactRequest(phoneNormalized, contactRequestId);
  if (!contactRequest) return { error: "NOT_FOUND" };
  if (contactRequest.paymentStatus !== "AWAITING_TRANSFER") return { error: "INVALID_STATE" };
  await prisma.contactRequest.update({ where: { id: contactRequestId }, data: { paymentStatus: "UNDER_REVIEW" } });
  logActivity({ action: "CONTACT_REQUEST_TRANSFER_MARKED_SENT", entity: "ContactRequest", entityId: contactRequestId });
  await notifyAdmins({ title: "إعلان العميل عن تحويل المبلغ", message: `أعلن ${contactRequest.name} عن تحويل المبلغ لطلبه، بانتظار التأكيد`, type: "CONTACT_REQUEST_TRANSFER_MARKED_SENT" });
  return { success: true };
}
