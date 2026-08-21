import path from "path";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";

// Fans out an internal notification to every active SUPER_ADMIN/ADMIN —
// originally inlined in createContactRequest only; extracted so every other
// contact-request event staff should know about (customer approved a price,
// selected an offer, uploaded a document, ...) can reuse the same fan-out
// instead of staff having to poll the Contact Requests tab to notice.
export async function notifyAdmins({ title, message, type }) {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) => createNotification({ title, message, type, userId: admin.id }))
  );
}

// `files` are the Service Intake wizard's uploaded documents (Umrah/Visas/
// Packages), if any — the plain contact form never sends these, so this
// defaults to none and behaves exactly as before. Documents are created in
// the same nested-write as the ContactRequest itself so a request is never
// left without the documents the customer attached to it.
export async function createContactRequest(data, req, files = []) {
  const documentLabels = data.documentLabels || [];

  const contactRequest = await prisma.contactRequest.create({
    data: {
      name: data.name,
      phone: data.phone,
      phoneNormalized: normalizePhone(data.phone),
      email: data.email || null,
      service: data.service || null,
      serviceId: data.serviceId || null,
      visaTypeId: data.visaTypeId || null,
      travelerCount: data.travelerCount ?? null,
      intakeData: data.intakeData ?? undefined,
      message: data.message,
      documents: files.length
        ? {
            create: files.map((file, index) => ({
              label: documentLabels[index] || file.originalname,
              fileName: file.originalname,
              storagePath: path.join("contact-request-documents", file.filename),
              mimeType: file.mimetype,
              sizeBytes: file.size,
            })),
          }
        : undefined,
    },
  });

  logActivity({
    action: "CONTACT_REQUEST_RECEIVED",
    entity: "ContactRequest",
    entityId: contactRequest.id,
    req,
  });

  await notifyAdmins({
    title: "طلب تواصل جديد من الموقع",
    message:
      `${contactRequest.name} (${contactRequest.phone}) — ${contactRequest.message.slice(0, 120)}` +
      (files.length ? ` — مع ${files.length} مستند(ات) مرفق(ة)` : ""),
    type: "CONTACT_REQUEST",
  });

  // Not awaited: a slow/unreachable WhatsApp API must not delay the
  // response to whoever submitted the contact form. No-ops entirely when
  // WHATSAPP_* env vars aren't set (see utils/whatsapp.js).
  sendWhatsAppMessage(
    process.env.WHATSAPP_ADMIN_NUMBER,
    `طلب تواصل جديد من الموقع\nالاسم: ${contactRequest.name}\nالهاتف: ${contactRequest.phone}\nالرسالة: ${contactRequest.message.slice(0, 200)}`
  );

  return contactRequest;
}

export async function listContactRequests({ page, limit, skip, status }) {
  const where = status ? { status } : undefined;

  const [data, total] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        invoice: true,
        documents: { orderBy: { createdAt: "desc" } },
        offers: { orderBy: { createdAt: "desc" } },
        deliverables: { orderBy: { createdAt: "desc" } },
        // Selected fields only — staff need the human-readable name/category
        // for a Service Intake submission, not the full catalog row.
        serviceRef: { select: { id: true, name: true, category: true } },
        visaType: { select: { id: true, name: true, country: true } },
      },
    }),
    prisma.contactRequest.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

// outcome/outcomeNote/closedAt only mean anything while the request is
// CLOSED — set together with it, and cleared together if the request is
// ever reopened (moved back to NEW/CONTACTED), so a stale outcome from a
// previous closure can never linger on a request that's active again.
export async function updateContactRequestStatus(id, { status, outcome, outcomeNote }, userId) {
  const existing = await prisma.contactRequest.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  const updated = await prisma.contactRequest.update({
    where: { id },
    data:
      status === "CLOSED"
        ? { status, outcome, outcomeNote: outcomeNote || null, closedAt: new Date() }
        : { status, outcome: null, outcomeNote: null, closedAt: null },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_STATUS_CHANGED",
    entity: "ContactRequest",
    entityId: id,
  });

  return updated;
}

// Creates the first quote for a ContactRequest, or reissues one after the
// customer rejected the previous quote. Once a customer has approved a
// quote the price is locked — callers must check for the "ALREADY_APPROVED"
// error and refuse the request rather than silently overwriting an amount
// the customer already agreed to pay. A request also can't mix pricing
// mechanisms — refuses if multi-carrier offers (see createOffer) are
// already in play for it.
export async function createOrUpdateInvoice(contactRequestId, data, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true, offers: true },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice?.status === "APPROVED") {
    return { error: "ALREADY_APPROVED" };
  }

  if (contactRequest.offers.length > 0) {
    return { error: "OFFERS_EXIST" };
  }

  const invoice = await prisma.invoice.upsert({
    where: { contactRequestId },
    create: {
      contactRequestId,
      amount: data.amount,
      currency: data.currency,
      description: data.description || null,
      createdByUserId: userId,
    },
    update: {
      amount: data.amount,
      currency: data.currency,
      description: data.description || null,
      status: "PENDING",
      decidedAt: null,
      createdByUserId: userId,
    },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_INVOICE_SET",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Not awaited: same rationale as createContactRequest — a slow/unreachable
  // WhatsApp API must never delay the response, and this silently no-ops
  // when WHATSAPP_* env vars aren't set (dev/test).
  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تم تحديد سعر لطلبك: ${data.amount} ${data.currency}\nيمكنك مراجعته والموافقة عليه عبر صفحة تتبع الطلب.`
  );

  return { invoice };
}

// Drops blank fields the flight-offer form submits as "" rather than
// omitting (every field is optional, so a staff member filling in only
// half of them is the common case) and collapses an all-blank object to
// null, so a non-flight offer (e.g. a ferry carrier) stores no JSON at all
// instead of an empty-looking one.
function sanitizeFlightDetails(flightDetails) {
  if (!flightDetails) {
    return null;
  }

  const entries = Object.entries(flightDetails).filter(
    ([, value]) => value !== "" && value !== undefined && value !== null
  );

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

// Adds one priced option to a request's multi-carrier offer set (see the
// ContactRequestOffer schema comment for when to use this instead of
// Invoice). Staff can keep adding offers until the customer selects one;
// a request also can't mix pricing mechanisms — refuses if an Invoice is
// already in play for it.
export async function createOffer(contactRequestId, data, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { invoice: true },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.invoice) {
    return { error: "INVOICE_EXISTS" };
  }

  if (contactRequest.selectedOfferId) {
    return { error: "ALREADY_SELECTED" };
  }

  const offer = await prisma.contactRequestOffer.create({
    data: {
      contactRequestId,
      carrier: data.carrier,
      description: data.description || null,
      amount: data.amount,
      currency: data.currency,
      flightDetails: sanitizeFlightDetails(data.flightDetails),
      validUntil: data.validUntil || null,
      internalNotes: data.internalNotes || null,
      createdByUserId: userId,
    },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_OFFER_ADDED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Not awaited: same rationale as elsewhere in this module.
  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `تمت إضافة عرض سعر جديد لطلبك (${data.carrier}): ${data.amount} ${data.currency}\nيمكنك مراجعة كل العروض واختيار الأنسب لك عبر صفحة تتبع الطلب.`
  );

  return { offer };
}

// Only moves AWAITING payment confirmation forward from UNDER_REVIEW — a
// customer must have first approved the quote (Invoice.status APPROVED,
// which sets paymentStatus AWAITING_TRANSFER) and then declared the
// transfer sent (paymentStatus UNDER_REVIEW) before staff can confirm it.
export async function confirmContactRequestPayment(contactRequestId, userId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (contactRequest.paymentStatus !== "UNDER_REVIEW") {
    return { error: "INVALID_STATE" };
  }

  const updated = await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { paymentStatus: "CONFIRMED", paymentConfirmedAt: new Date() },
  });

  logActivity({
    userId,
    action: "CONTACT_REQUEST_PAYMENT_CONFIRMED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  return { contactRequest: updated };
}
