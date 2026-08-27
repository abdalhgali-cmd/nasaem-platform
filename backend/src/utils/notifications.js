import prisma from "../config/database.js";

// Best-effort, same rationale as logActivity: never break the triggering
// operation because a notification failed to write.
export async function createNotification({ title, message, type, userId, customerId, orderId }) {
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
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}
