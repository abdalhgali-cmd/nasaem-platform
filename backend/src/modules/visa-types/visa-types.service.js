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

// --- Requirements checklist (Platform 3.0 Phase 5) ---

export async function listRequirements(visaTypeId, { includeInactive = false } = {}) {
  return prisma.visaRequirement.findMany({
    where: { visaTypeId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRequirement(visaTypeId, data) {
  const visaType = await prisma.visaType.findUnique({ where: { id: visaTypeId }, select: { id: true } });
  if (!visaType) return null;

  return prisma.visaRequirement.create({
    data: {
      visaTypeId,
      name: data.name,
      nameEn: data.nameEn || null,
      description: data.description || null,
      required: typeof data.required === "boolean" ? data.required : true,
      attachmentType: data.attachmentType || null,
      maxFiles: data.maxFiles ?? 1,
      allowedMimeTypes: data.allowedMimeTypes ?? [],
      maxSizeBytes: data.maxSizeBytes ?? null,
      reviewRequired: typeof data.reviewRequired === "boolean" ? data.reviewRequired : true,
      ocrEnabled: typeof data.ocrEnabled === "boolean" ? data.ocrEnabled : false,
      sortOrder: data.sortOrder ?? 0,
      active: typeof data.active === "boolean" ? data.active : true,
    },
  });
}

export async function updateRequirement(id, data) {
  const existing = await prisma.visaRequirement.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.visaRequirement.update({ where: { id }, data });
}

export async function deleteRequirement(id) {
  const existing = await prisma.visaRequirement.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.visaRequirement.delete({ where: { id } });
  return existing;
}

// Narrow, public-safe shape — no internal metadata — used both by the
// public checklist endpoint and by createContactRequest's snapshot.
const PUBLIC_REQUIREMENT_SELECT = {
  id: true,
  name: true,
  nameEn: true,
  description: true,
  required: true,
  attachmentType: true,
  maxFiles: true,
  allowedMimeTypes: true,
  maxSizeBytes: true,
  ocrEnabled: true,
};

export async function getPublicChecklist(visaTypeId) {
  return prisma.visaRequirement.findMany({
    where: { visaTypeId, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: PUBLIC_REQUIREMENT_SELECT,
  });
}
