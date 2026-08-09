import path from "path";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { nextSequence } from "../../utils/sequence.js";
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

// Only a priced Umrah package with a chosen currency triggers the
// bank-transfer flow — every other submission (any other service, or an
// Umrah request with no matching package/currency) stays NOT_REQUIRED.
// `paymentSettings` is the caller's single getPublicPaymentSettings() read,
// passed in so a request that also needs the bank account number for its
// response doesn't fetch Settings twice.
function resolvePayment(service, details, currency, paymentSettings) {
  const packageName = details?.["نوع الباقة"];
  const priceSar = service === "عمرة" && packageName ? UMRAH_PACKAGE_PRICES_SAR[packageName] : undefined;

  if (!priceSar || !currency) {
    return { currency: null, paymentAmount: null, paymentStatus: "NOT_REQUIRED" };
  }

  if (currency === "SAR") {
    return { currency, paymentAmount: priceSar, paymentStatus: "AWAITING_TRANSFER" };
  }

  if (!paymentSettings.sarToSdgRate) {
    throw Object.assign(
      new Error("الدفع بالجنيه غير متاح حاليًا، يرجى اختيار الريال أو التواصل معنا"),
      { statusCode: 422 }
    );
  }

  return {
    currency,
    paymentAmount: Math.round(priceSar * paymentSettings.sarToSdgRate * 100) / 100,
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

export async function attachPassportImage(id, file) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.contactRequest.update({
    where: { id },
    data: { passportImagePath: path.join("contact-request-files", file.filename) },
  });
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
