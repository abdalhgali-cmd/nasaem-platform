import prisma from "../config/database.js";

// Best-effort: a logging failure must never break the business operation
// that triggered it, so errors are swallowed (after being logged to stderr)
// rather than propagated.
export async function logActivity({ userId, action, entity, entityId, req }) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: userId || null,
        action,
        entity,
        entityId: entityId || null,
        ipAddress: req?.ip || null,
        userAgent: req?.headers?.["user-agent"] || null,
      },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
