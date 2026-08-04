import prisma from "../config/database.js";

// Best-effort, same rationale as logActivity: never break the triggering
// operation because a notification failed to write.
export async function createNotification({ title, message, type, userId, orderId }) {
  if (!userId) return;

  try {
    await prisma.notification.create({
      data: {
        title,
        message,
        type,
        userId,
        orderId: orderId || null,
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}
