import path from "path";
import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { logActivity } from "../../utils/activityLog.js";
import { notifyAdmins } from "../contact-requests/contact-requests.service.js";

const UPLOAD_ROOT = path.resolve("uploads");

export async function createContactRequestDocument(contactRequestId, { label, file }) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  const document = await prisma.contactRequestDocument.create({
    data: {
      contactRequestId,
      label,
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

  return { document: updated };
}
