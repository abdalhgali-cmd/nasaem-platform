import prisma from "../config/database.js";

// Best-effort, same rationale as logActivity: never break the triggering
// operation because a notification failed to write.
export async function createNotification({ title, message, type, userId, customerId, orderId, contactRequestId, requirementId, travelerId }) {
  if (!userId && !customerId) return;

  try {
    await prisma.notification.create({
      data: {
        title,
        message,
        type,
        userId: userId || null,
        customerId: customerId || null,
        orderId: orderId || null,
        contactRequestId: contactRequestId || null,
        requirementId: requirementId || null,
        travelerId: travelerId || null,
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

// In-app notification for the customer who owns a request (account holders
// only; a guest has no inbox and is reached by WhatsApp and the tracking
// screen). Always carries the request id, so tapping it opens that request.
export async function notifyRequestCustomer(contactRequest, { title, message, type, requirementId = null, travelerId = null }) {
  if (!contactRequest?.customerId) return;
  await createNotification({
    customerId: contactRequest.customerId, title, message, type, contactRequestId: contactRequest.id,
    ...(requirementId ? { requirementId, travelerId: travelerId || null } : {}),
  });
}
