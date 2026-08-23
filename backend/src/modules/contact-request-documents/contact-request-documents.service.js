import path from "path";
import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { describeRequest, notifyAdmins } from "../contact-requests/contact-requests.service.js";

const UPLOAD_ROOT = path.resolve("uploads");

// Platform 3.0 Phase 6 (Attachment Engine) — when an upload is tied to a
// specific VisaRequirement, validates it against that requirement's own
// allowedMimeTypes/maxSizeBytes/maxFiles rules (on top of the generic
// global MIME/size filter multer already applies to every upload).
// Returns an error code the controller maps to a clean 400, or null if
// the upload is fine to proceed.
async function validateRequirementUpload(contactRequest, requirementId, file) {
  const requirement = await prisma.visaRequirement.findUnique({ where: { id: requirementId } });

  if (!requirement || requirement.visaTypeId !== contactRequest.visaTypeId) {
    return { code: "REQUIREMENT_NOT_FOUND" };
  }

  if (requirement.allowedMimeTypes.length > 0 && !requirement.allowedMimeTypes.includes(file.mimetype)) {
    return { code: "INVALID_MIME", allowedMimeTypes: requirement.allowedMimeTypes };
  }

  if (requirement.maxSizeBytes && file.size > requirement.maxSizeBytes) {
    return { code: "FILE_TOO_LARGE", maxSizeBytes: requirement.maxSizeBytes };
  }

  const existingCount = await prisma.contactRequestDocument.count({
    where: { contactRequestId: contactRequest.id, requirementId },
  });
  if (existingCount >= requirement.maxFiles) {
    return { code: "MAX_FILES_REACHED", maxFiles: requirement.maxFiles };
  }

  return null;
}

export async function createContactRequestDocument(contactRequestId, { label, file, requirementId }) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  if (requirementId) {
    const validationError = await validateRequirementUpload(contactRequest, requirementId, file);
    if (validationError) return { error: validationError.code, details: validationError };
  }

  const document = await prisma.contactRequestDocument.create({
    data: {
      contactRequestId,
      label,
      requirementId: requirementId || null,
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
