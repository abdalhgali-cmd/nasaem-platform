import path from "path";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { nextSequence } from "../../utils/sequence.js";
import { normalizePhone } from "../../utils/phone.js";
import { getPublicPaymentSettings } from "../settings/settings.service.js";
import { deriveContactRequestDepartment } from "./contact-request-department.js";

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

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`invoice-${year}`);
  return `INV-${year}-${String(seq).padStart(5, "0")}`;
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

// Shared by listContactRequests/listContactRequestsForPhone (staff + "my
// requests" listings) and every ContactRequestOffer read below — a leg is
// meaningless to render without its carrier's name attached.
const OFFER_INCLUDE = { legs: { include: { carrier: true }, orderBy: { createdAt: "asc" } } };

// Department-scoped EMPLOYEEs must not be able to read or act on a
// ContactRequest outside their assigned department, even via a direct
// :id route once they know/guess it — not just via the filtered list view
// (see listContactRequests' own department WHERE clause for that half).
// Every other role is exempt entirely. A null on either side (unmapped
// request, or an employee with no department) always falls through to
// "allowed" — see the department fields' schema.prisma comments.
export function assertContactRequestAccess(user, contactRequest) {
  if (
    user?.role === "EMPLOYEE" &&
    user.department &&
    contactRequest?.department &&
    user.department !== contactRequest.department
  ) {
    throw Object.assign(new Error("You do not have access to this contact request"), { statusCode: 403 });
  }
}

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
      department: deriveContactRequestDepartment(data.service),
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

const VALID_DEPARTMENTS = ["VISAS", "FLIGHTS", "UMRAH", "HOTELS_PACKAGES", "FERRY"];

export async function listContactRequests({ page, limit, skip, status, department, user }) {
  const conditions = [];
  if (status) conditions.push({ status });
  if (department && VALID_DEPARTMENTS.includes(department)) conditions.push({ department });
  if (user?.role === "EMPLOYEE" && user.department) {
    // Unmapped (department: null) requests stay visible to every scoped
    // employee — see ContactRequest.department's schema.prisma comment.
    conditions.push({ OR: [{ department: user.department }, { department: null }] });
  }
  const where = conditions.length > 0 ? { AND: conditions } : undefined;

  const [data, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      include: { invoice: true, documents: true, offers: { include: OFFER_INCLUDE, orderBy: { createdAt: "asc" } } },
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
  const all = await prisma.contactRequest.findMany({
    include: { invoice: true, documents: true, offers: { include: OFFER_INCLUDE, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return all.filter((row) => normalizePhone(row.phone) === normalizedPhone);
}

export async function updateContactRequestStatus(id, status, req) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }
  assertContactRequestAccess(req.user, existing);

  return prisma.contactRequest.update({
    where: { id },
    data: { status },
  });
}

// `files` is one upload batch (e.g. one per traveler) — appended as new
// ContactRequestDocument rows rather than replacing anything, so a
// re-upload after a rejection adds a new row (the rejected one stays for
// audit) instead of silently wiping unrelated documents. Shared by the
// passport/guarantor-Iqama/additional-document uploads, which are
// otherwise identical. Returns the existing ContactRequest row (truthy) on
// success, matching the null-on-missing-request convention every caller in
// this file relies on for 404 handling — createMany's count-only return
// can't distinguish that on its own.
async function createContactRequestDocuments(id, files, type) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  await prisma.contactRequestDocument.createMany({
    data: files.map((file) => ({
      contactRequestId: id,
      type,
      storagePath: path.join("contact-request-files", file.filename),
    })),
  });

  return existing;
}

export function attachPassportImages(id, files) {
  return createContactRequestDocuments(id, files, "PASSPORT");
}

export function attachGuarantorIdImages(id, files) {
  return createContactRequestDocuments(id, files, "GUARANTOR_ID");
}

export function attachAdditionalDocuments(id, files) {
  return createContactRequestDocuments(id, files, "ADDITIONAL");
}

export async function listContactRequestDocuments(contactRequestId, req) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: { department: true },
  });
  if (contactRequest) assertContactRequestAccess(req.user, contactRequest);

  return prisma.contactRequestDocument.findMany({
    where: { contactRequestId },
    orderBy: { createdAt: "asc" },
  });
}

const DOCUMENT_TYPE_LABELS_AR = {
  PASSPORT: "صورة جواز السفر",
  GUARANTOR_ID: "صورة إقامة الضامن",
  ADDITIONAL: "المستند الإضافي",
};

// Ownership/scoping is enforced by requiring the document's own
// contactRequestId to match the URL's :id, not just a bare findUnique by
// documentId — otherwise a valid documentId for a *different* request
// would be reviewable through the wrong request's URL.
export async function updateContactRequestDocumentStatus(contactRequestId, documentId, { status, rejectionReason }, req) {
  const document = await prisma.contactRequestDocument.findUnique({ where: { id: documentId } });

  if (!document || document.contactRequestId !== contactRequestId) {
    return null;
  }

  const contactRequest = await prisma.contactRequest.findUnique({ where: { id: contactRequestId } });
  assertContactRequestAccess(req.user, contactRequest);

  const updated = await prisma.contactRequestDocument.update({
    where: { id: documentId },
    data: { status, rejectionReason: status === "REJECTED" ? rejectionReason : null },
  });

  logActivity({
    userId: req.user?.id,
    action: "CONTACT_REQUEST_DOCUMENT_REVIEWED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    req,
  });

  if (status === "REJECTED") {
    // Not awaited, same reasoning as every other WhatsApp send in this file.
    sendWhatsAppMessage(
      contactRequest.phone,
      `تم رفض ${DOCUMENT_TYPE_LABELS_AR[document.type]} الذي أرفقته لطلبك رقم ${contactRequest.referenceNumber}\nالسبب: ${rejectionReason}\nيرجى رفع نسخة جديدة عبر صفحة "تتبع طلبك" على موقعنا.`
    );
  }

  return updated;
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

export async function updatePaymentStatus(id, status, req) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }
  assertContactRequestAccess(req.user, existing);

  const updated = await prisma.contactRequest.update({
    where: { id },
    data: { paymentStatus: status },
  });

  if (existing.paymentStatus !== "CONFIRMED" && status === "CONFIRMED") {
    // Not awaited, same reasoning as every other WhatsApp send in this file.
    sendWhatsAppMessage(
      updated.phone,
      `تم تأكيد استلام دفعتك لطلبك رقم ${updated.referenceNumber}\nالمبلغ: ${updated.paymentAmount} ${CURRENCY_LABELS_AR[updated.currency]}\nشكرًا لك، سيتم متابعة طلبك.`
    );
  }

  return updated;
}

// Proposes a price for a request that had no catalog price at submission
// (everything except a priced Umrah package, which resolvePayment() already
// prices automatically) — e.g. a work visa's contract + authorized-office
// number, reviewed and priced by staff. Unlike the old one-step version of
// this action, this does NOT start the payment flow: it only creates (or
// revises) the customer's quote. ContactRequest.paymentStatus stays
// NOT_REQUIRED until the customer explicitly approves it — see
// approveInvoice below.
//
// A quote can be freely revised (upsert) while still PENDING_APPROVAL —
// staff correcting a wrong amount before the customer has acted is the
// common case, not worth a separate "cancel and recreate" step. Once
// APPROVED, the price is locked: the existing payment-status transitions
// own the request from there, so this rejects (statusCode 400) rather than
// silently re-pricing an already-agreed amount out from under the customer.
export async function createOrUpdatePriceQuote(id, { currency, paymentAmount }, req) {
  const existing = await prisma.contactRequest.findUnique({
    where: { id },
    include: { invoice: true },
  });

  if (!existing) {
    return null;
  }
  assertContactRequestAccess(req.user, existing);

  if (existing.invoice?.status === "APPROVED") {
    throw Object.assign(new Error("This request's quote has already been approved"), { statusCode: 400 });
  }

  const invoice = existing.invoice
    ? await prisma.invoice.update({
        where: { contactRequestId: id },
        data: { currency, amount: paymentAmount },
      })
    : await prisma.invoice.create({
        data: {
          contactRequestId: id,
          invoiceNumber: await generateInvoiceNumber(),
          currency,
          amount: paymentAmount,
        },
      });

  logActivity({
    userId: req.user?.id,
    action: "CONTACT_REQUEST_QUOTE_CREATED",
    entity: "ContactRequest",
    entityId: existing.id,
    req,
  });

  // Not awaited, same reasoning as the WhatsApp send in createContactRequest:
  // a slow/unreachable WhatsApp API must not delay the staff member's
  // response. No-ops entirely when WHATSAPP_* env vars aren't set.
  sendWhatsAppMessage(
    existing.phone,
    `طلبك رقم ${existing.referenceNumber} جاهز للتسعير\nالمبلغ المقترح: ${paymentAmount} ${CURRENCY_LABELS_AR[currency]}\nيرجى مراجعة والموافقة عليه من صفحة "تتبع طلبك" على موقعنا.`
  );

  return { contactRequest: existing, invoice };
}

// The customer's actual agreement to pay — this is what starts the
// bank-transfer flow (previously done in one step by what's now
// createOrUpdatePriceQuote). Ownership-checked by phone, unlike the
// existing public upload endpoints which trust "knows the id" alone: this
// is a financial action, not a document attachment.
export async function approveInvoice(contactRequestId, customerPhone, req) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true, offers: { where: { status: "APPROVED" } } },
  });

  if (!contactRequest || !contactRequest.invoice) {
    return null;
  }

  if (normalizePhone(contactRequest.phone) !== customerPhone) {
    return "forbidden";
  }

  if (contactRequest.invoice.status !== "PENDING_APPROVAL") {
    return undefined;
  }

  // A request should only ever be priced one way. If an offer already got
  // approved (and possibly already paid/confirmed) since this invoice was
  // created, approving the stale invoice too would silently overwrite
  // paymentAmount/currency and reset paymentStatus out from under it.
  if (contactRequest.offers.length > 0 || contactRequest.paymentStatus === "CONFIRMED") {
    throw Object.assign(new Error("This request has already been priced through a different offer"), {
      statusCode: 400,
    });
  }

  const { currency, amount } = contactRequest.invoice;

  const [, updatedContactRequest] = await prisma.$transaction([
    prisma.invoice.update({
      where: { contactRequestId },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
    prisma.contactRequest.update({
      where: { id: contactRequestId },
      data: { currency, paymentAmount: amount, paymentStatus: "AWAITING_TRANSFER" },
    }),
  ]);

  const paymentSettings = await getPublicPaymentSettings();
  const bankAccount = paymentSettings.bankAccounts[currency];

  logActivity({
    action: "CONTACT_REQUEST_QUOTE_APPROVED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    req,
  });

  // Not awaited, same reasoning as every other WhatsApp send in this file.
  // This is where the bank account details now belong — sending them
  // before the customer had actually agreed to pay wasn't accurate.
  sendWhatsAppMessage(
    updatedContactRequest.phone,
    `تم اعتماد السعر لطلبك رقم ${updatedContactRequest.referenceNumber}\nالمبلغ المستحق: ${amount} ${CURRENCY_LABELS_AR[currency]}\n${bankAccount ? `الحساب البنكي: ${bankAccount}` : "سيتم التواصل معك لتفاصيل الدفع"}`
  );

  return { contactRequest: updatedContactRequest, bankAccount };
}

const TRIP_LEG_DIRECTION_LABELS_AR = { OUTBOUND: "ذهاب", RETURN: "عودة" };

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summarizeLegsForWhatsApp(legs) {
  return legs
    .map(
      (leg) =>
        `${TRIP_LEG_DIRECTION_LABELS_AR[leg.direction]}: ${leg.carrier.name}${leg.tripNumber ? ` (${leg.tripNumber})` : ""} — ${leg.fromLocation} → ${leg.toLocation}`
    )
    .join("\n");
}

function buildLegCreateInput(legs) {
  return legs.map((leg) => ({
    carrierId: leg.carrierId,
    direction: leg.direction,
    tripNumber: leg.tripNumber || null,
    departureAt: toDateOrNull(leg.departureAt),
    arrivalAt: toDateOrNull(leg.arrivalAt),
    fromLocation: leg.fromLocation,
    toLocation: leg.toLocation,
  }));
}

// Proposes one of possibly several priced alternatives for a request (e.g.
// two airlines at two prices) — generalizes createOrUpdatePriceQuote to
// many-per-request. Refuses (400) if the request already has an APPROVED
// Invoice — a request should use one pricing mechanism or the other, not
// both; Invoice's own code path is otherwise entirely untouched.
export async function createContactRequestOffer(contactRequestId, { currency, amount, notes, legs }, req) {
  const existing = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true },
  });

  if (!existing) {
    return null;
  }
  assertContactRequestAccess(req.user, existing);

  if (existing.invoice?.status === "APPROVED") {
    throw Object.assign(new Error("This request already has an approved invoice"), { statusCode: 400 });
  }

  let offer;
  try {
    offer = await prisma.contactRequestOffer.create({
      data: {
        contactRequestId,
        currency,
        amount,
        notes: notes || null,
        legs: { create: buildLegCreateInput(legs) },
      },
      include: OFFER_INCLUDE,
    });
  } catch (error) {
    if (error.code === "P2003") {
      throw Object.assign(new Error("أحد الناقلين المحددين غير موجود"), { statusCode: 400 });
    }
    throw error;
  }

  logActivity({
    userId: req.user?.id,
    action: "CONTACT_REQUEST_OFFER_CREATED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    req,
  });

  // Not awaited, same reasoning as every other WhatsApp send in this file.
  sendWhatsAppMessage(
    existing.phone,
    `طلبك رقم ${existing.referenceNumber} — عرض سعر جديد\nالمبلغ: ${amount} ${CURRENCY_LABELS_AR[currency]}\n${summarizeLegsForWhatsApp(offer.legs)}\nيمكنك مراجعة كل العروض المتاحة والموافقة على واحد منها من صفحة "تتبع طلبك" على موقعنا.`
  );

  return offer;
}

export async function listContactRequestOffers(contactRequestId, req) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: { department: true },
  });
  if (contactRequest) assertContactRequestAccess(req.user, contactRequest);

  return prisma.contactRequestOffer.findMany({
    where: { contactRequestId },
    include: OFFER_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
}

// Edits always replace the full leg list (delete-then-recreate in one
// transaction) rather than diffing individual legs — legs carry no
// independent identity/history requirement, same "revise in place"
// simplicity as createOrUpdatePriceQuote.
export async function updateContactRequestOffer(contactRequestId, offerId, { currency, amount, notes, legs }, req) {
  const offer = await prisma.contactRequestOffer.findUnique({ where: { id: offerId } });

  if (!offer || offer.contactRequestId !== contactRequestId) {
    return null;
  }

  const parentContactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: { department: true },
  });
  assertContactRequestAccess(req.user, parentContactRequest);

  if (offer.status !== "PENDING_APPROVAL") {
    throw Object.assign(new Error("Only a pending offer can be edited"), { statusCode: 400 });
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await tx.tripLeg.deleteMany({ where: { offerId } });
      return tx.contactRequestOffer.update({
        where: { id: offerId },
        data: { currency, amount, notes: notes || null, legs: { create: buildLegCreateInput(legs) } },
        include: OFFER_INCLUDE,
      });
    });
  } catch (error) {
    if (error.code === "P2003") {
      throw Object.assign(new Error("أحد الناقلين المحددين غير موجود"), { statusCode: 400 });
    }
    throw error;
  }

  logActivity({
    userId: req.user?.id,
    action: "CONTACT_REQUEST_OFFER_UPDATED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    req,
  });

  return updated;
}

export async function withdrawContactRequestOffer(contactRequestId, offerId, req) {
  const offer = await prisma.contactRequestOffer.findUnique({ where: { id: offerId } });

  if (!offer || offer.contactRequestId !== contactRequestId) {
    return null;
  }

  const parentContactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: { department: true },
  });
  assertContactRequestAccess(req.user, parentContactRequest);

  if (offer.status !== "PENDING_APPROVAL") {
    throw Object.assign(new Error("Only a pending offer can be withdrawn"), { statusCode: 400 });
  }

  const updated = await prisma.contactRequestOffer.update({ where: { id: offerId }, data: { status: "WITHDRAWN" } });

  logActivity({
    userId: req.user?.id,
    action: "CONTACT_REQUEST_OFFER_WITHDRAWN",
    entity: "ContactRequest",
    entityId: contactRequestId,
    req,
  });

  return updated;
}

// Customer-facing counterpart to approveInvoice — same
// null/"forbidden"/undefined/result return-value convention and the same
// ownership check. Auto-DECLINEs every other still-pending sibling offer
// on the same request, which approveInvoice has no equivalent of (Invoice
// is already 1:1).
export async function approveContactRequestOffer(contactRequestId, offerId, customerPhone, req) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true },
  });

  if (!contactRequest) {
    return null;
  }

  const offer = await prisma.contactRequestOffer.findUnique({ where: { id: offerId }, include: OFFER_INCLUDE });

  if (!offer || offer.contactRequestId !== contactRequestId) {
    return null;
  }

  if (normalizePhone(contactRequest.phone) !== customerPhone) {
    return "forbidden";
  }

  if (offer.status !== "PENDING_APPROVAL") {
    return undefined;
  }

  // Symmetric to approveInvoice's own guard: a request should only ever be
  // priced one way. Reject rather than silently overwrite an already-locked
  // invoice or an already-confirmed payment.
  if (contactRequest.invoice?.status === "APPROVED" || contactRequest.paymentStatus === "CONFIRMED") {
    throw Object.assign(new Error("This request has already been priced through its invoice"), {
      statusCode: 400,
    });
  }

  // Interactive transaction (not a plain array of promises) so the approve
  // + decline-siblings step can be conditioned on the offer still being
  // PENDING_APPROVAL *inside* the transaction and abort if not. This is a
  // single raw UPDATE (not two separate Prisma updateMany calls) on
  // purpose: two concurrent approvals of two different pending offers (A
  // and B) on the same request, each first locking their own target row
  // then reaching for the other's row to decline it, is a textbook
  // lock-order deadlock (confirmed by a concurrency test that reproduced
  // exactly this with two sequential updateMany calls). A single statement
  // per transaction that touches the whole affected row set at once
  // acquires locks in one consistent scan order, so the loser just blocks
  // and retries instead of deadlocking.
  const updatedContactRequest = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      UPDATE "ContactRequestOffer"
      SET
        status = CASE WHEN id = ${offerId} THEN 'APPROVED'::"ContactRequestOfferStatus" ELSE 'DECLINED'::"ContactRequestOfferStatus" END,
        "approvedAt" = CASE WHEN id = ${offerId} THEN NOW() ELSE "approvedAt" END,
        "updatedAt" = NOW()
      WHERE "contactRequestId" = ${contactRequestId} AND status = 'PENDING_APPROVAL'::"ContactRequestOfferStatus"
      RETURNING id, status
    `;

    const approvedRow = rows.find((row) => row.id === offerId && row.status === "APPROVED");
    if (!approvedRow) {
      throw Object.assign(new Error("This offer is no longer awaiting approval"), { statusCode: 400 });
    }

    return tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { currency: offer.currency, paymentAmount: offer.amount, paymentStatus: "AWAITING_TRANSFER" },
    });
  });

  const paymentSettings = await getPublicPaymentSettings();
  const bankAccount = paymentSettings.bankAccounts[offer.currency];

  logActivity({
    action: "CONTACT_REQUEST_OFFER_APPROVED",
    entity: "ContactRequest",
    entityId: contactRequestId,
    req,
  });

  // Not awaited, same reasoning as every other WhatsApp send in this file.
  sendWhatsAppMessage(
    updatedContactRequest.phone,
    `تم اعتماد العرض لطلبك رقم ${updatedContactRequest.referenceNumber}\n${summarizeLegsForWhatsApp(offer.legs)}\nالمبلغ المستحق: ${offer.amount} ${CURRENCY_LABELS_AR[offer.currency]}\n${bankAccount ? `الحساب البنكي: ${bankAccount}` : "سيتم التواصل معك لتفاصيل الدفع"}`
  );

  return { contactRequest: updatedContactRequest, offer, bankAccount };
}
