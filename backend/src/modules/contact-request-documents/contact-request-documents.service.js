import path from "path";
import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { maybeRunPassportOcr } from "../passport-ocr/passport-ocr.service.js";
import { describeRequest, notifyAdmins, refreshCaseTasks } from "../contact-requests/contact-requests.service.js";

import { UPLOAD_ROOT } from "../../config/uploadRoot.js";

// Platform 3.0 Phase 6 (Attachment Engine) — when an upload is tied to a
// specific VisaRequirement, validates it against that requirement's own
// allowedMimeTypes/maxSizeBytes/maxFiles rules (on top of the generic
// global MIME/size filter multer already applies to every upload).
// Returns { requirement } on success (so the caller can read ocrEnabled
// without a second query) or { error } if the upload should be rejected.
async function validateRequirementUpload(contactRequest, requirementId, file) {
  const requirement = await prisma.visaRequirement.findUnique({ where: { id: requirementId } });

  // A requirement belongs to exactly one parent (visaTypeId or
  // serviceId — see schema.prisma's VisaRequirement comment); it must
  // match whichever one this contact request was actually submitted for.
  const belongsToRequest =
    requirement &&
    ((requirement.visaTypeId && requirement.visaTypeId === contactRequest.visaTypeId) ||
      (requirement.serviceId && requirement.serviceId === contactRequest.serviceId));

  if (!belongsToRequest) {
    return { error: { code: "REQUIREMENT_NOT_FOUND" } };
  }

  if (requirement.allowedMimeTypes.length > 0 && !requirement.allowedMimeTypes.includes(file.mimetype)) {
    return { error: { code: "INVALID_MIME", allowedMimeTypes: requirement.allowedMimeTypes } };
  }

  if (requirement.maxSizeBytes && file.size > requirement.maxSizeBytes) {
    return { error: { code: "FILE_TOO_LARGE", maxSizeBytes: requirement.maxSizeBytes } };
  }

  // Smart Case Operations — Release A. Superseded documents, and a REJECTED
  // document still awaiting its replacement (superseding happens later in
  // createContactRequestDocument, after this check runs), don't count
  // against maxFiles — otherwise a requirement capped at 1 file could never
  // accept its own replacement upload.
  const existingCount = await prisma.contactRequestDocument.count({
    where: { contactRequestId: contactRequest.id, requirementId, supersededAt: null, status: { not: "REJECTED" } },
  });
  if (existingCount >= requirement.maxFiles) {
    return { error: { code: "MAX_FILES_REACHED", maxFiles: requirement.maxFiles } };
  }

  return { requirement };
}

export async function createContactRequestDocument(contactRequestId, { label, file, requirementId, travelerId, classification }) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  // Smart Case Operations — Release A. A travelerId is never trusted as-is
  // from the client — it must actually belong to this same contact request,
  // otherwise a customer could tag a document onto a traveler from a
  // different request/case (an IDOR-shaped write) purely by guessing an id.
  if (travelerId) {
    const traveler = await prisma.traveler.findFirst({ where: { id: travelerId, contactRequestId } });
    if (!traveler) return { error: "TRAVELER_NOT_FOUND" };
  }

  let requirement = null;
  if (requirementId) {
    const validation = await validateRequirementUpload(contactRequest, requirementId, file);
    if (validation.error) return { error: validation.error.code, details: validation.error };
    requirement = validation.requirement;
  }

  const ocrResult = await maybeRunPassportOcr(requirement, file);

  // Smart Case Operations — Release A (document versioning / replacement
  // flow). A new upload for the same requirement+traveler that currently
  // has a REJECTED, not-yet-superseded document replaces it: the old row
  // is kept (supersededAt set, never deleted or mutated — full history
  // survives, see schema.prisma's ContactRequestDocument.supersededAt
  // comment) and the new upload becomes the current version. Only REJECTED
  // documents are ever auto-superseded this way — a PENDING/ACCEPTED
  // document for the same requirement is left alone (multiple files can be
  // legitimately in flight up to maxFiles, e.g. a multi-page upload).
  if (requirementId) {
    await prisma.contactRequestDocument.updateMany({
      where: { contactRequestId, requirementId, travelerId: travelerId || null, status: "REJECTED", supersededAt: null },
      data: { supersededAt: new Date() },
    });
  }

  const document = await prisma.contactRequestDocument.create({
    data: {
      contactRequestId,
      label,
      requirementId: requirementId || null,
      travelerId: travelerId || null,
      // Defaults to CUSTOMER_DOCUMENT at the schema level — only callers
      // that know better (e.g. a payment receipt) pass something else.
      ...(classification ? { classification } : {}),
      ocrResult: ocrResult ?? undefined,
      fileName: file.originalname,
      // Relative to the uploads root, not the absolute server path — same
      // convention as documents.controller.js, so API responses never leak
      // server directory layout.
      storagePath: path.join("contact-request-documents", file.filename),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    },
  });

  // Customer-initiated (no staff req.user) — logged with userId: null, same
  // as every other tracking-driven event, and fanned out to admins so
  // staff actually notice a document is waiting for review.
  logActivity({
    action: "CONTACT_REQUEST_DOCUMENT_UPLOADED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  await notifyAdmins({
    title: "رفع مستند جديد",
    message: `رفع ${contactRequest.name} مستندًا جديدًا: ${label.slice(0, 60)}`,
    type: "CONTACT_REQUEST_DOCUMENT_UPLOADED",
  });

  // Release E: a new upload is new review work.
  await refreshCaseTasks(contactRequestId);

  return { document };
}

// Shared by both the staff (contact-requests) and customer (tracking) file
// routes — each caller does its own auth/ownership check before calling
// this, so it only needs to confirm the document actually belongs to the
// contact request in the URL (never trust documentId alone).
export async function getContactRequestDocumentFile(contactRequestId, documentId) {
  const document = await prisma.contactRequestDocument.findFirst({
    where: { id: documentId, contactRequestId },
  });

  if (!document) {
    return null;
  }

  return {
    absolutePath: path.join(UPLOAD_ROOT, document.storagePath),
    fileName: document.fileName,
    mimeType: document.mimeType,
  };
}

export async function updateContactRequestDocumentStatus(
  contactRequestId,
  documentId,
  { status, reviewNote },
  reviewerUserId
) {
  const document = await prisma.contactRequestDocument.findFirst({
    where: { id: documentId, contactRequestId },
  });

  if (!document) {
    return { error: "NOT_FOUND" };
  }

  const updated = await prisma.contactRequestDocument.update({
    where: { id: documentId },
    data: {
      status,
      reviewNote: reviewNote || null,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
    },
    include: { reviewedBy: { select: safeUserSelect } },
  });

  logActivity({
    userId: reviewerUserId,
    action: "CONTACT_REQUEST_DOCUMENT_REVIEWED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Release E: a review decision can complete "review documents" or open
  // "check payment" — keep the case's open tasks in step with it.
  await refreshCaseTasks(contactRequestId);

  // Guarded on the review status actually changing — re-saving the same
  // decision (e.g. staff re-submitting a rejection with just an edited
  // note) must not re-notify the customer with a duplicate message.
  if (document.status !== updated.status) {
    const contactRequest = await prisma.contactRequest.findUnique({
      where: { id: contactRequestId },
    });

    const message =
      updated.status === "ACCEPTED"
        ? `تم قبول المستند "${updated.label}" الخاص بطلبك (${describeRequest(contactRequest)}).`
        : `تم رفض المستند "${updated.label}" الخاص بطلبك (${describeRequest(contactRequest)}).\n` +
          `السبب: ${updated.reviewNote}\nيرجى إعادة رفعه عبر صفحة تتبع الطلب.`;

    // Not awaited: same rationale as every other WhatsApp send in this
    // codebase — never let a slow/unreachable WhatsApp API delay the staff
    // response.
    sendWhatsAppMessage(contactRequest.phoneNormalized, message);
  }

  return { document: updated };
}
