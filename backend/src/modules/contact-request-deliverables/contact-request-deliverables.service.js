import path from "path";
import prisma from "../../config/database.js";

const UPLOAD_ROOT = path.resolve("uploads");

export async function createContactRequestDeliverable(contactRequestId, { label, file }, uploadedByUserId) {
  const contactRequest = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
  });

  if (!contactRequest) {
    return { error: "NOT_FOUND" };
  }

  const deliverable = await prisma.contactRequestDeliverable.create({
    data: {
      contactRequestId,
      label,
      fileName: file.originalname,
      // Relative to the uploads root, not the absolute server path — same
      // convention as documents/contact-request-documents, so API responses
      // never leak server directory layout.
      storagePath: path.join("contact-request-deliverables", file.filename),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedByUserId,
    },
  });

  return { deliverable };
}

// Shared by both the staff (contact-requests) and customer (tracking) file
// routes — each caller does its own auth/ownership check before calling
// this, so it only needs to confirm the deliverable actually belongs to the
// contact request in the URL (never trust deliverableId alone).
export async function getContactRequestDeliverableFile(contactRequestId, deliverableId) {
  const deliverable = await prisma.contactRequestDeliverable.findFirst({
    where: { id: deliverableId, contactRequestId },
  });

  if (!deliverable) {
    return null;
  }

  return {
    absolutePath: path.join(UPLOAD_ROOT, deliverable.storagePath),
    fileName: deliverable.fileName,
    mimeType: deliverable.mimeType,
  };
}
