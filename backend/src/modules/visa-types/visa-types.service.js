import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listVisaTypes({ page, limit, skip }, { category } = {}) {
  const where = category ? { category } : {};

  const [data, total] = await Promise.all([
    prisma.visaType.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.visaType.count({ where }),
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
      category: data.category || "OTHER",
      sortOrder: data.sortOrder ?? 0,
      pricingMode: data.pricingMode || "QUOTE",
      priceUnit: data.priceUnit || "PER_REQUEST",
      paymentAfterDocumentReview: Boolean(data.paymentAfterDocumentReview),
    },
  });
}

// Same rules as services.service.js (AUDIT-00 G-07): a visa type used by a
// request keeps its code and is deactivated, never deleted. The row lock
// orders a delete or code change after a request insert that references it.
async function lockVisaType(tx, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "VisaType" WHERE id = ${id} FOR UPDATE`;
  return rows.length > 0;
}

export async function updateVisaType(id, data) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockVisaType(tx, id))) return null;
    const existing = await tx.visaType.findUnique({ where: { id } });
    if (data.code !== undefined && data.code !== existing.code && (await tx.contactRequest.count({ where: { visaTypeId: id } })) > 0) {
      return { error: "CODE_IN_USE" };
    }
    return tx.visaType.update({ where: { id }, data });
  });
}

// Returns { visaType, deactivated } or null.
export async function deleteVisaType(id) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockVisaType(tx, id))) return null;
    const existing = await tx.visaType.findUnique({ where: { id } });
    if ((await tx.contactRequest.count({ where: { visaTypeId: id } })) > 0) {
      return { visaType: await tx.visaType.update({ where: { id }, data: { active: false } }), deactivated: true };
    }
    await tx.visaType.delete({ where: { id } });
    return { visaType: existing, deactivated: false };
  });
}

export async function reorderVisaTypes(orderedIds) {
  const existingCount = await prisma.visaType.count({ where: { id: { in: orderedIds } } });
  if (existingCount !== orderedIds.length) return null;

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.visaType.update({ where: { id }, data: { sortOrder: index } })),
  );

  return prisma.visaType.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
}
