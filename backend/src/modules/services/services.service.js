import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listServices({ page, limit, skip }) {
  const [data, total] = await Promise.all([
    prisma.service.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.service.count(),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getServiceById(id) {
  return prisma.service.findUnique({ where: { id } });
}

export async function createService(data) {
  return prisma.service.create({
    data: {
      code: data.code,
      name: data.name,
      category: data.category,
      description: data.description || null,
      basePrice: data.basePrice,
      currency: data.currency || "SAR",
      active: typeof data.active === "boolean" ? data.active : true,
    },
  });
}

export async function updateService(id, data) {
  const existing = await prisma.service.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.service.update({
    where: { id },
    data,
  });
}

export async function deleteService(id) {
  const existing = await prisma.service.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  // Services referenced by existing order items are protected at the DB
  // level (onDelete: Restrict on OrderItem.service) — deactivate instead of
  // deleting if a service has ever been used in an order.
  const usageCount = await prisma.orderItem.count({ where: { serviceId: id } });

  if (usageCount > 0) {
    return prisma.service.update({ where: { id }, data: { active: false } });
  }

  await prisma.service.delete({ where: { id } });
  return existing;
}
