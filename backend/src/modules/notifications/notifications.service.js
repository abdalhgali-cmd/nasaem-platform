import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listNotifications(userId, { page, limit, skip }) {
  const where = { userId };

  const [data, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { data, meta: { ...buildPaginationMeta(page, limit, total), unreadCount } };
}

export async function markNotificationRead(userId, id) {
  const notification = await prisma.notification.findUnique({ where: { id } });

  if (!notification || notification.userId !== userId) {
    return null;
  }

  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}
