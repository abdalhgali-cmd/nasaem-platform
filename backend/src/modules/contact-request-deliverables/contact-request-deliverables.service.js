import path from "path";
import prisma from "../../config/database.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { notifyRequestCustomer } from "../../utils/notifications.js";
import { announceCompletion, completeIfDone, describeRequest } from "../contact-requests/contact-requests.service.js";
import { ACTIONS, checkAction, checkCoverage } from "../contact-request-workflow/workflow-policy.js";
import { auditInTransaction, refuseWith, withLockedRequest } from "../contact-request-workflow/workflow-lock.js";
import {
  CONTACT_REQUEST_DELIVERABLE_DIR,
  generateUniqueFilename,
  saveBufferToDirectory,
} from "../../middleware/upload.middleware.js";
import { resolveStoredUploadPath } from "../../config/uploadRoot.js";

function storedPath(file) {
  if (file.buffer) {
    const filename = generateUniqueFilename(file.originalname);
    saveBufferToDirectory(file.buffer, CONTACT_REQUEST_DELIVERABLE_DIR, filename);
    return path.join("contact-request-deliverables", filename);
  }
  return path.join("contact-request-deliverables", file.filename);
}

// Publishing makes a prepared file visible and downloadable for the
// customer. Only after the payment was accepted and the start of execution
// recorded, each file once. Inside the same locked transaction the request
// is completed if this file was the last missing output (completeIfDone),
// so a concurrent cancellation either happens first (and this is refused)
// or after (and is refused itself).
async function publishInTransaction(tx, request, deliverable, userId, travelerIds) {
  const refusal = checkAction(ACTIONS.PUBLISH_DELIVERABLE, request, { deliverable });
  if (refusal) refuseWith(refusal);
  const coverage = travelerIds ?? deliverable.travelerIds;
  const invalid = checkCoverage(request, coverage);
  if (invalid) refuseWith(invalid);
  const published = await tx.contactRequestDeliverable.updateMany({
    where: { id: deliverable.id, publishedAt: null },
    data: { publishedAt: new Date(), publishedByUserId: userId, travelerIds: coverage },
  });
  if (published.count !== 1) refuseWith({ status: 409, code: "ALREADY_PUBLISHED", message: "هذا الملف منشور للعميل بالفعل." });
  const current = await tx.contactRequestDeliverable.findUnique({ where: { id: deliverable.id } });
  await auditInTransaction(tx, {
    userId,
    action: "CONTACT_REQUEST_DELIVERABLE_PUBLISHED",
    entityId: request.id,
    organizationId: request.organizationId,
    newValue: { deliverableId: deliverable.id, label: deliverable.label, travelerIds: coverage },
  });
  const after = { ...request, deliverables: request.deliverables.map((d) => (d.id === current.id ? current : d)).concat(request.deliverables.some((d) => d.id === current.id) ? [] : [current]) };
  const completed = await completeIfDone(tx, after, { userId });
  return { deliverable: current, completed };
}

async function announcePublished(request, deliverable, completed) {
  await notifyRequestCustomer(request, {
    title: "ملف جاهز للتحميل",
    message: `أصبح الملف "${deliverable.label}" جاهزًا لطلبك (${describeRequest(request)}).`,
    type: "CONTACT_REQUEST_DELIVERABLE_READY",
  });
  // Not awaited: never let a slow/unreachable WhatsApp API delay the staff response.
  sendWhatsAppMessage(
    request.phoneNormalized,
    `أصبح الملف "${deliverable.label}" جاهزًا لطلبك (${describeRequest(request)}).\nيمكنك تحميله عبر صفحة تتبع الطلب.`
  );
  if (completed) await announceCompletion(completed);
}

// Uploads a final file. publish=false (default) only prepares it: a draft
// is never listed, announced or downloadable for the customer. publish=true
// publishes it in the same step, with the same conditions as publishing a
// draft. A closed request takes no new final file.
export async function createContactRequestDeliverable(contactRequestId, { label, file, travelerIds, publish = false }, uploadedByUserId) {
  const result = await withLockedRequest(contactRequestId, null, async (tx, request) => {
    const refusal = checkAction(publish ? ACTIONS.PUBLISH_DELIVERABLE : ACTIONS.PREPARE_DELIVERABLE, request);
    if (refusal) refuseWith(refusal);
    if (travelerIds !== undefined || publish) {
      const invalid = checkCoverage(request, travelerIds || []);
      if (invalid) refuseWith(invalid);
    }
    const draft = await tx.contactRequestDeliverable.create({
      data: {
        contactRequestId,
        label,
        fileName: file.originalname,
        // Relative to the uploads root, never the absolute server path.
        storagePath: storedPath(file),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId,
        travelerIds: travelerIds || [],
      },
    });
    await auditInTransaction(tx, {
      userId: uploadedByUserId,
      action: "CONTACT_REQUEST_DELIVERABLE_UPLOADED",
      entityId: contactRequestId,
      organizationId: request.organizationId,
      newValue: { deliverableId: draft.id, label, travelerIds: travelerIds || [], publish },
    });
    if (!publish) return { deliverable: draft, request };
    const published = await publishInTransaction(tx, { ...request, deliverables: [...request.deliverables, draft] }, draft, uploadedByUserId, travelerIds || []);
    return { ...published, request, publishedNow: true };
  });
  if (result.error || result.refusal) return result;
  if (result.publishedNow) await announcePublished(result.request, result.deliverable, result.completed);
  return { deliverable: result.deliverable };
}

export async function publishContactRequestDeliverable(contactRequestId, deliverableId, { travelerIds } = {}, userId) {
  const result = await withLockedRequest(contactRequestId, null, async (tx, request) => {
    const deliverable = request.deliverables.find((d) => d.id === deliverableId);
    if (!deliverable) return { error: "NOT_FOUND" };
    return { ...(await publishInTransaction(tx, request, deliverable, userId, travelerIds)), request };
  });
  if (result.error || result.refusal) return result;
  await announcePublished(result.request, result.deliverable, result.completed);
  return { deliverable: result.deliverable, completed: Boolean(result.completed) };
}

// Shared by both the staff (contact-requests) and customer (tracking) file
// routes — each caller does its own auth/ownership check before calling
// this, so it only needs to confirm the deliverable actually belongs to the
// contact request in the URL (never trust deliverableId alone).
// publishedOnly: the customer surfaces never serve a prepared (draft) file.
export async function getContactRequestDeliverableFile(contactRequestId, deliverableId, { publishedOnly = false } = {}) {
  const deliverable = await prisma.contactRequestDeliverable.findFirst({
    where: { id: deliverableId, contactRequestId, ...(publishedOnly ? { publishedAt: { not: null } } : {}) },
  });

  if (!deliverable) {
    return null;
  }

  return {
    absolutePath: resolveStoredUploadPath(deliverable.storagePath),
    fileName: deliverable.fileName,
    mimeType: deliverable.mimeType,
  };
}
