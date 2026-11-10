import prisma from "../../config/database.js";
import { ensureUmrahPassportRequirement, isPassportRequirement, UMRAH_PASSPORT_TYPE } from "./umrah-passport.js";
import { isUmrahServiceCategory } from "./umrah-guarantor.js";

// Shared checklist engine (Platform 3.0 Phase 5, generalized in Phase 8)
// backing both VisaType and Service requirements. `scope` is always
// exactly one of { visaTypeId } or { serviceId } — callers (visa-types
// and services modules) build it from their own route params, so this
// module stays agnostic to which parent type it's serving.

export async function listRequirements(scope, { includeInactive = false } = {}) {
  return prisma.visaRequirement.findMany({
    where: { ...scope, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

async function parentExists(scope) {
  if (scope.visaTypeId) {
    return Boolean(await prisma.visaType.findUnique({ where: { id: scope.visaTypeId }, select: { id: true } }));
  }
  return Boolean(await prisma.service.findUnique({ where: { id: scope.serviceId }, select: { id: true } }));
}

export async function createRequirement(scope, data) {
  if (!(await parentExists(scope))) return null;
  if (scope.serviceId && isPassportRequirement(data)) {
    const parent = await prisma.service.findUnique({ where: { id: scope.serviceId }, select: { category: true } });
    if (isUmrahServiceCategory(parent?.category)) {
      const passport = await ensureUmrahPassportRequirement(prisma, scope.serviceId);
      return prisma.visaRequirement.update({ where: { id: passport.id }, data: { ...data,
        required: true, active: true, type: "DOCUMENT", scope: "TRAVELER", attachmentType: UMRAH_PASSPORT_TYPE,
        conditionRequirementId: null, conditionOperator: null, conditionValue: null } });
    }
  }

  return prisma.visaRequirement.create({
    data: {
      visaTypeId: scope.visaTypeId || null,
      serviceId: scope.serviceId || null,
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
      type: data.type || "DOCUMENT",
      scope: data.scope || "CASE",
      options: data.options ?? undefined,
      conditionRequirementId: data.conditionRequirementId || null,
      conditionOperator: data.conditionOperator || null,
      conditionValue: data.conditionValue || null,
    },
  });
}

export async function updateRequirement(id, data) {
  const existing = await prisma.visaRequirement.findUnique({ where: { id }, include: { service: { select: { category: true } } } });
  if (!existing) return null;
  if (isUmrahServiceCategory(existing.service?.category) && isPassportRequirement(existing)) {
    const invalid = data.required === false || data.active === false ||
      (data.scope !== undefined && data.scope !== "TRAVELER") || (data.type !== undefined && data.type !== "DOCUMENT") ||
      (data.attachmentType !== undefined && data.attachmentType !== UMRAH_PASSPORT_TYPE) ||
      data.conditionRequirementId || data.conditionOperator || data.conditionValue;
    if (invalid) throw Object.assign(new Error("جواز كل معتمر متطلب إلزامي لا يمكن تعطيله أو جعله عامًا للطلب."), { status: 400, code: "UMRAH_PASSPORT_REQUIRED" });
  }
  return prisma.visaRequirement.update({ where: { id }, data });
}

export async function deleteRequirement(id) {
  const existing = await prisma.visaRequirement.findUnique({ where: { id }, include: { service: { select: { category: true } } } });
  if (!existing) return null;
  if (isUmrahServiceCategory(existing.service?.category) && isPassportRequirement(existing)) {
    throw Object.assign(new Error("لا يمكن حذف متطلب جواز سفر المعتمر."), { status: 400, code: "UMRAH_PASSPORT_REQUIRED" });
  }
  await prisma.visaRequirement.delete({ where: { id } });
  return existing;
}

// Narrow, public-safe shape — no internal metadata — used both by the
// public checklist endpoints and by createContactRequest's snapshot.
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
  type: true,
  scope: true,
  options: true,
  conditionRequirementId: true,
  conditionOperator: true,
  conditionValue: true,
};

export async function getPublicChecklist(scope) {
  return prisma.visaRequirement.findMany({
    where: { ...scope, active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: PUBLIC_REQUIREMENT_SELECT,
  });
}

export { requirementApplies } from "./requirement-conditions.js";
