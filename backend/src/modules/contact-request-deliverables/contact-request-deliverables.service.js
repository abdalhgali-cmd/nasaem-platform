import path from "path";
import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import {
  describeRequest,
  maybeAutoCompleteContactRequest,
} from "../contact-requests/contact-requests.service.js";

import { UPLOAD_ROOT } from "../../config/uploadRoot.js";

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

  logActivity({
    userId: uploadedByUserId,
    action: "CONTACT_REQUEST_DELIVERABLE_UPLOADED",
    entity: "ContactRequest",
    entityId: contactRequestId,
  });

  // Not awaited: same rationale as every other WhatsApp send in this
  // codebase — never let a slow/unreachable WhatsApp API delay the staff
  // response.
  sendWhatsAppMessage(
    contactRequest.phoneNormalized,
    `أصبح الملف "${label}" جاهزًا لطلبك (${describeRequest(contactRequest)}).\nيمكنك تحميله عبر صفحة تتبع الطلب.`
  );

  // Payment may already have been confirmed before this file existed — the
  // deliverable half of the auto-completion condition just became true, so
  // re-check it now that both could hold.
  await maybeAutoCompleteContactRequest(contactRequestId);

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
