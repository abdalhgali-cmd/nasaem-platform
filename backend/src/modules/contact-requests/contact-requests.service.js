import path from "path";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { nextSequence } from "../../utils/sequence.js";
import { normalizePhone } from "../../utils/phone.js";
import { getPublicPaymentSettings } from "../settings/settings.service.js";

// Mirrors the package names/prices in web/src/app/umrah/page.tsx's
// umrahRequestFields "نوع الباقة" select. Priced server-side (not trusted
// from the client) since this amount is what staff check a bank-transfer
// receipt against.
const UMRAH_PACKAGE_PRICES_SAR = {
  "تأشيرة عمرة فقط": 1200,
  "عمرة مع الخدمات": 4500,
  "العمرة الجماعية (الأفواج)": 3800,
};

async function generateReferenceNumber() {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`contact-request-${year}`);
  return `NH-${year}-${String(seq).padStart(5, "0")}`;
}

const MAX_UMRAH_TRAVELERS = 7;

// Package prices are per person (see the "ريال / للفرد" unit on
// featured-umrah.tsx's cards) — the total owed scales with how many
// travelers are on the request.
function resolveTravelerCount(details) {
  const raw = Number(details?.["عدد الأشخاص"]);
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return Math.min(raw, MAX_UMRAH_TRAVELERS);
}

const CURRENCY_LABELS_AR = { SAR: "الريال", SDG: "الجنيه", USD: "الدولار" };

// Only a priced Umrah package with a chosen currency triggers the
// bank-transfer flow — every other submission (any other service, or an
// Umrah request with no matching package/currency) stays NOT_REQUIRED.
// `paymentSettings` is the caller's single getPublicPaymentSettings() read,
// passed in so a request that also needs the bank account number for its
// response doesn't fetch Settings twice.
//
// The Sudanese Pound (SDG) is the pivot for conversion, not a direct
// SAR<->USD cross rate: both sar_to_sdg_rate and usd_to_sdg_rate are
// quoted "how many SDG per unit of this currency", matching how the admin
// actually looks up rates day-to-day. SAR needs no rate at all since
// package prices are already defined in SAR.
export function resolvePayment(service, details, currency, paymentSettings) {
  const packageName = details?.["نوع الباقة"];
  const pricePerPersonSar = service === "عمرة" && packageName ? UMRAH_PACKAGE_PRICES_SAR[packageName] : undefined;

  if (!pricePerPersonSar || !currency) {
    return { currency: null, paymentAmount: null, paymentStatus: "NOT_REQUIRED" };
  }

  const totalSar = pricePerPersonSar * resolveTravelerCount(details);

  if (currency === "SAR") {
    return { currency, paymentAmount: totalSar, paymentStatus: "AWAITING_TRANSFER" };
  }

  const unavailable = () =>
    Object.assign(
      new Error(`الدفع بـ${CURRENCY_LABELS_AR[currency]} غير متاح حاليًا، يرجى اختيار عملة أخرى أو التواصل معنا`),
      { statusCode: 422 }
    );

  if (!paymentSettings.sarToSdgRate) {
    throw unavailable();
  }

  const totalSdg = totalSar * paymentSettings.sarToSdgRate;

  if (currency === "SDG") {
    return { currency, paymentAmount: Math.round(totalSdg * 100) / 100, paymentStatus: "AWAITING_TRANSFER" };
  }

  // currency === "USD"
  if (!paymentSettings.usdToSdgRate) {
    throw unavailable();
  }

  return {
    currency,
    paymentAmount: Math.round((totalSdg / paymentSettings.usdToSdgRate) * 100) / 100,
    paymentStatus: "AWAITING_TRANSFER",
  };
}

// The `message` column is required (NOT NULL) since it predates structured
// `details` and every dashboard view/notification still reads it. A
// service-form submission may have no free-text notes at all, so fall back
// to a readable summary built from its structured fields instead of "".
function composeMessage(message, details) {
  const trimmed = message?.trim();
  if (trimmed) return trimmed;

  if (details && Object.keys(details).length > 0) {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join("، ");
  }

  return "-";
}

export async function createContactRequest(data, req) {
  const message = composeMessage(data.message, data.details);
  const paymentSettings = data.currency ? await getPublicPaymentSettings() : null;
  const payment = resolvePayment(data.service, data.details, data.currency, paymentSettings);
  const referenceNumber = await generateReferenceNumber();

  const contactRequest = await prisma.contactRequest.create({
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      service: data.service || null,
      message,
      details: data.details && Object.keys(data.details).length > 0 ? data.details : undefined,
      referenceNumber,
      currency: payment.currency,
      paymentAmount: payment.paymentAmount,
      paymentStatus: payment.paymentStatus,
    },
  });

  logActivity({
    action: "CONTACT_REQUEST_RECEIVED",
    entity: "ContactRequest",
    entityId: contactRequest.id,
    req,
  });

  // Fan out an internal notification to every admin so a new inquiry from
  // the public site is actually seen, not just silently stored.
  const admins = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        title: "طلب تواصل جديد من الموقع",
        message: `${contactRequest.name} (${contactRequest.phone}) — ${contactRequest.message.slice(0, 120)}`,
        type: "CONTACT_REQUEST",
        userId: admin.id,
      })
    )
  );

  // Not awaited: a slow/unreachable WhatsApp API must not delay the
  // response to whoever submitted the contact form. No-ops entirely when
  // WHATSAPP_* env vars aren't set (see utils/whatsapp.js).
  sendWhatsAppMessage(
    process.env.WHATSAPP_ADMIN_NUMBER,
    `طلب تواصل جديد من الموقع\nالاسم: ${contactRequest.name}\nالهاتف: ${contactRequest.phone}\nالرسالة: ${contactRequest.message.slice(0, 200)}`
  );

  return {
    contactRequest,
    bankAccount: payment.currency ? paymentSettings.bankAccounts[payment.currency] : null,
  };
}

export async function listContactRequests({ page, limit, skip, status }) {
  const where = status ? { status } : undefined;

  const [data, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.contactRequest.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

// Legacy rows were never stored with a normalized phone, so matching
// happens in application code (via normalizePhone) rather than a SQL
// WHERE clause — the volume here (one customer's own submissions) is small
// enough that this is fine; revisit with a normalized+indexed column if
// this table grows large.
export async function listContactRequestsForPhone(normalizedPhone) {
  const all = await prisma.contactRequest.findMany({ orderBy: { createdAt: "desc" } });
  return all.filter((row) => normalizePhone(row.phone) === normalizedPhone);
}

export async function updateContactRequestStatus(id, status) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.contactRequest.update({
    where: { id },
    data: { status },
  });
}

// `files` is the full set for the request (one per traveler), uploaded
// together right after creation — this replaces whatever was there rather
// than appending, since the form only ever submits them once as a batch.
// Shared by both the passport-photo and guarantor-Iqama-photo uploads,
// which are otherwise identical.
async function attachTravelerImages(id, files, field) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.contactRequest.update({
    where: { id },
    data: {
      [field]: files.map((file) => path.join("contact-request-files", file.filename)),
    },
  });
}

export function attachPassportImages(id, files) {
  return attachTravelerImages(id, files, "passportImagePaths");
}

export function attachGuarantorIdImages(id, files) {
  return attachTravelerImages(id, files, "guarantorIdImagePaths");
}

export function attachAdditionalDocuments(id, files) {
  return attachTravelerImages(id, files, "additionalDocumentPaths");
}

// Uploading a receipt only makes sense once a request actually has a price
// waiting on a transfer; a NOT_REQUIRED or already-CONFIRMED request has
// nothing for this to move forward, so the caller gets a null (→ 400/404
// depending on which precondition failed) instead of silently accepting it.
export async function attachPaymentReceipt(id, file) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  if (existing.paymentStatus !== "AWAITING_TRANSFER" && existing.paymentStatus !== "UNDER_REVIEW") {
    return undefined;
  }

  return prisma.contactRequest.update({
    where: { id },
    data: {
      paymentReceiptPath: path.join("contact-request-files", file.filename),
      paymentStatus: "UNDER_REVIEW",
    },
  });
}

export async function updatePaymentStatus(id, status) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.contactRequest.update({
    where: { id },
    data: { paymentStatus: status },
  });
}

// Manually starts a bank-transfer flow for a request that had no catalog
// price at submission (everything except a priced Umrah package, which
// resolvePayment() already prices automatically). Staff reviews whatever
// was submitted (e.g. a work visa's contract + authorized-office number),
// decides the price, and this is what actually asks the customer to pay —
// mirrors resolvePayment()'s AWAITING_TRANSFER outcome, just triggered
// later and by a person instead of a price list.
//
// Only ever allowed once: a request that's already NOT_REQUIRED-only-by-
// default moves forward from here, but one that's already mid-flow
// (AWAITING_TRANSFER/UNDER_REVIEW/CONFIRMED) must go through the existing
// payment-status transitions instead, not get re-priced out from under
// itself — so this returns `undefined` (not the same as `null`s 404) for
// the caller to turn into a 400.
export async function approveContactRequestPayment(id, { currency, paymentAmount }, req) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  if (existing.paymentStatus !== "NOT_REQUIRED") {
    return undefined;
  }

  const paymentSettings = await getPublicPaymentSettings();
  const bankAccount = paymentSettings.bankAccounts[currency];

  const contactRequest = await prisma.contactRequest.update({
    where: { id },
    data: { currency, paymentAmount, paymentStatus: "AWAITING_TRANSFER" },
  });

  logActivity({
    userId: req.user?.id,
    action: "CONTACT_REQUEST_PAYMENT_APPROVED",
    entity: "ContactRequest",
    entityId: contactRequest.id,
    req,
  });

  // Not awaited, same reasoning as the WhatsApp send in createContactRequest:
  // a slow/unreachable WhatsApp API must not delay the staff member's
  // response. No-ops entirely when WHATSAPP_* env vars aren't set.
  sendWhatsAppMessage(
    contactRequest.phone,
    `تم اعتماد طلبك رقم ${contactRequest.referenceNumber}\nالمبلغ المستحق: ${paymentAmount} ${CURRENCY_LABELS_AR[currency]}\n${bankAccount ? `الحساب البنكي: ${bankAccount}` : "سيتم التواصل معك لتفاصيل الدفع"}`
  );

  return { contactRequest, bankAccount };
}
