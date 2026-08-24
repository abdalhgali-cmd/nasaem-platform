import path from "path";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { normalizePhone } from "../../utils/phone.js";
import {
  OUTCOME_LABELS,
  STATUS_LABELS,
} from "../contact-request-tracking/contact-request-tracking.status.js";
import { maybeRunPassportOcr } from "../passport-ocr/passport-ocr.service.js";
import { getPublicChecklist } from "../requirements/requirements.service.js";
import { isFeatureEnabled } from "../feature-flags/feature-flags.service.js";
import { SERVICE_CATEGORY_FEATURE_FLAGS } from "../feature-flags/feature-flags.constants.js";

// Short, consistent "which request is this about" prefix for every
// customer-facing WhatsApp notification below — reuses the same `service`
// label and `id` the customer already sees on the wizard's confirmation
// screen and in /track, so the reference is recognizable, not a new format.
// Exported so the sibling document/deliverable modules can build the same
// reference in their own customer notifications instead of duplicating it.
export function describeRequest(contactRequest) {
  return contactRequest.service
    ? `${contactRequest.service} (رقم ${contactRequest.id})`
    : `رقم ${contactRequest.id}`;
}

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
  const documentRequirementIds = data.documentRequirementIds || [];

  // Platform 3.0 Phase 13: HOTEL_SEARCH/SECURITY_APPROVAL gate intake for
  // the specific, real Service categories that already exist for those
  // capabilities (seeded in Phase 3/8: "hotel", "egypt_clearance") — not
  // a guessed/invented rule for what else might count as one. See
  // SERVICE_CATEGORY_FEATURE_FLAGS's own comment for this disclosed
  // boundary.
  if (data.serviceId) {
    const service = await prisma.service.findUnique({ where: { id: data.serviceId }, select: { category: true } });
    const flagKey = service ? SERVICE_CATEGORY_FEATURE_FLAGS[service.category] : null;
    if (flagKey && !(await isFeatureEnabled(flagKey))) {
      return { error: "FEATURE_DISABLED" };
    }
  }

  // Platform 3.0 Phase 5: capture the selected visa type's (or, since
  // Phase 8, service's — e.g. Security Approvals) active requirements
  // checklist AS IT IS RIGHT NOW. This is a point-in-time copy, not a
  // live reference — an admin editing/deactivating a requirement later
  // must never change what this specific application's checklist said at
  // submission time.
  const requirementsSnapshot = data.visaTypeId
    ? await getPublicChecklist({ visaTypeId: data.visaTypeId })
    : data.serviceId
      ? await getPublicChecklist({ serviceId: data.serviceId })
      : null;

  // Platform 3.0 Phase 6: validate each file tagged with a requirementId
  // against that requirement's own rules — reusing the snapshot just
  // fetched above rather than a second query per file. Rejects the whole
  // submission (nothing is created) rather than silently dropping/
  // mislabeling a file that doesn't satisfy its requirement.
  // Platform 3.0 Phase 7: OCR result per file index, populated only for
  // files tagged with a requirementId whose ocrEnabled is set (see the
  // validation loop below, which also builds requirementsById).
  const ocrResults = new Array(files.length).fill(null);

  if (documentRequirementIds.some(Boolean)) {
    const requirementsById = new Map((requirementsSnapshot || []).map((r) => [r.id, r]));
    const countByRequirement = new Map();

    for (let i = 0; i < files.length; i += 1) {
      const requirementId = documentRequirementIds[i];
      if (!requirementId) continue;

      const requirement = requirementsById.get(requirementId);
      if (!requirement) return { error: "REQUIREMENT_NOT_FOUND" };

      const file = files[i];
      if (requirement.allowedMimeTypes.length > 0 && !requirement.allowedMimeTypes.includes(file.mimetype)) {
        return { error: "INVALID_MIME", details: { requirementId, allowedMimeTypes: requirement.allowedMimeTypes } };
      }
      if (requirement.maxSizeBytes && file.size > requirement.maxSizeBytes) {
        return { error: "FILE_TOO_LARGE", details: { requirementId, maxSizeBytes: requirement.maxSizeBytes } };
      }

      const seenCount = (countByRequirement.get(requirementId) || 0) + 1;
      countByRequirement.set(requirementId, seenCount);
      if (seenCount > requirement.maxFiles) {
        return { error: "MAX_FILES_REACHED", details: { requirementId, maxFiles: requirement.maxFiles } };
      }

      ocrResults[i] = await maybeRunPassportOcr(requirement, file);
    }
  }

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
      requirementsSnapshot: requirementsSnapshot && requirementsSnapshot.length ? requirementsSnapshot : undefined,
      message: data.message,
      documents: files.length
        ? {
            create: files.map((file, index) => ({
              label: documentLabels[index] || file.originalname,
              requirementId: documentRequirementIds[index] || null,
              ocrResult: ocrResults[index] ?? undefined,
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

  // Guarded on the status actually changing — staff editing only the
  // outcome/note of an already-CLOSED request (see "تعديل النتيجة" in the
  // staff dashboard) re-submits the same CLOSED status and must not re-fire
  // a notification the customer already received.
  if (existing.status !== updated.status) {
    const label =
      updated.status === "CLOSED"
        ? (updated.outcome && OUTCOME_LABELS[updated.outcome]) || STATUS_LABELS.CLOSED
        : STATUS_LABELS[updated.status];

    // Not awaited: same rationale as every other WhatsApp send in this
    // module — never let a slow/unreachable WhatsApp API delay the staff
    // response, and this silently no-ops when WHATSAPP_* env vars aren't
    // set (dev/test).
    sendWhatsAppMessage(
      updated.phoneNormalized,
      `تحديث بخصوص طلبك (${describeRequest(updated)}):\n${label}\nيمكنك متابعة كل التفاصيل عبر صفحة تتبع الطلب.`
    );
  }

  return updated;
}

// Phase 1.5 — auto-completion. Pure predicate, deliberately side-effect
// free so it's trivially unit-testable and safe to call from both trigger
// points below without worrying about DB access: given a request's current
// status/paymentStatus and whether it already has at least one delivered
// file, decide if it's now safe to auto-close it as COMPLETED. Reuses the
// existing NOT_REQUIRED/AWAITING_TRANSFER/UNDER_REVIEW/CONFIRMED payment
// state machine and the existing CLOSED/COMPLETED status+outcome values —
// no new state is introduced.
export function shouldAutoComplete({ status, paymentStatus, hasDeliverable }) {
  return status !== "CLOSED" && paymentStatus === "CONFIRMED" && Boolean(hasDeliverable);
}

// Re-checks the condition above and closes the request if it now holds.
// Called after either half of it could have just become true (payment
// confirmed, or a deliverable uploaded) — whichever happens second is the
// one that actually closes it; whichever happens first is a no-op here.
// Idempotent: once a request is CLOSED, every later call (e.g. a second
// deliverable) sees status === "CLOSED" and does nothing — no repeat
// update, no repeat notification, no other side effect.
export async function maybeAutoCompleteContactRequest(contactRequestId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    include: { deliverables: { select: { id: true }, take: 1 } },
  });

  if (!contactRequest) {
    return null;
  }

  const eligible = shouldAutoComplete({
    status: contactRequest.status,
    paymentStatus: contactRequest.paymentStatus,
    hasDeliverable: contactRequest.deliverables.length > 0,
  });

  if (!eligible) {
    return null;
  }

  const updated = await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { status: "CLOSED", outcome: "COMPLETED", outcomeNote: null, closedAt: new Date() },
  });

  logActivity({
    action: "CONTACT_REQUEST_AUTO_COMPLETED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  sendWhatsAppMessage(
    updated.phoneNormalized,
    `${OUTCOME_LABELS.COMPLETED} — ${describeRequest(updated)}.\nشكرًا لثقتك بنا!`
  );

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

  // Not awaited: same rationale as elsewhere in this module.
  sendWhatsAppMessage(
    updated.phoneNormalized,
    `تم تأكيد استلام تحويلك لطلبك (${describeRequest(updated)}). سنبدأ بتنفيذ طلبك.`
  );

  // A deliverable may already exist from before this payment confirmation
  // (staff sometimes prepare/upload the final file while payment is still
  // under review) — re-check the auto-completion condition now that the
  // payment half of it just became true.
  const completed = await maybeAutoCompleteContactRequest(contactRequestId);

  return { contactRequest: completed ?? updated };
}
