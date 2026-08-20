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

// Backs the public Service Intake wizard (web/): active services + visa
// types only, with a narrow field set (no internal metadata like
// createdAt/updatedAt) — deliberately not the same shape as the staff
// listServices() above, which is auth-gated and returns full rows.
const PUBLIC_SERVICE_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  description: true,
  basePrice: true,
  currency: true,
};

const PUBLIC_VISA_TYPE_SELECT = {
  id: true,
  code: true,
  name: true,
  country: true,
  description: true,
  basePrice: true,
  currency: true,
  serviceId: true,
};

export async function listPublicCatalog() {
  const [services, visaTypes] = await Promise.all([
    prisma.service.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: PUBLIC_SERVICE_SELECT,
    }),
    prisma.visaType.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: PUBLIC_VISA_TYPE_SELECT,
    }),
  ]);

  return { services, visaTypes };
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
