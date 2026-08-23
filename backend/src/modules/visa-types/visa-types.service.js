import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listVisaTypes({ page, limit, skip }) {
  const [data, total] = await Promise.all([
    prisma.visaType.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.visaType.count(),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getVisaTypeById(id) {
  return prisma.visaType.findUnique({ where: { id } });
}

export async function createVisaType(data) {
  return prisma.visaType.create({
    data: {
      code: data.code,
      name: data.name,
      nameEn: data.nameEn || null,
      country: data.country,
      description: data.description || null,
      basePrice: data.basePrice,
      currency: data.currency || "SAR",
      active: typeof data.active === "boolean" ? data.active : true,
      serviceId: data.serviceId || null,
      type: data.type || null,
      processingTime: data.processingTime || null,
      stayDuration: data.stayDuration || null,
      validity: data.validity || null,
      entryType: data.entryType || null,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateVisaType(id, data) {
  const existing = await prisma.visaType.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.visaType.update({ where: { id }, data });
}

export async function deleteVisaType(id) {
  const existing = await prisma.visaType.findUnique({ where: { id } });
  if (!existing) return null;

  // Same posture as services.service.js's deleteService: a visa type
  // already referenced by a contact request must not disappear from
  // historical records, so deactivate instead of a hard delete.
  const usageCount = await prisma.contactRequest.count({ where: { visaTypeId: id } });
  if (usageCount > 0) {
    return prisma.visaType.update({ where: { id }, data: { active: false } });
  }

  await prisma.visaType.delete({ where: { id } });
  return existing;
}

export async function reorderVisaTypes(orderedIds) {
  const existingCount = await prisma.visaType.count({ where: { id: { in: orderedIds } } });
  if (existingCount !== orderedIds.length) return null;

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.visaType.update({ where: { id }, data: { sortOrder: index } })),
  );

  return prisma.visaType.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
}
