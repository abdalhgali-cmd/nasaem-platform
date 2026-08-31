import prisma from "../../config/database.js";

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

// Smart Case Operations — Release A (Conditional Requirements). Given one
// requirement from a checklist snapshot and the answers submitted alongside
// it (a plain { [requirementId]: value } map — see contact-requests.service.js),
// decides whether this requirement currently applies. A requirement with no
// condition set always applies (matches every requirement created before
// this release). Deliberately the smallest possible rule set — see
// schema.prisma's RequirementConditionOperator comment — not a general
// expression engine.
//
// GREATER_THAN/LESS_THAN compare numerically; if either side isn't a valid
// number the condition is treated as not satisfied (fails closed: an
// unanswered/malformed prerequisite means the dependent requirement is not
// yet shown as required, matching "ask only what is still necessary").
export function requirementApplies(requirement, answers = {}) {
  if (!requirement.conditionRequirementId || !requirement.conditionOperator) {
    return true;
  }

  const actual = answers[requirement.conditionRequirementId];
  const expected = requirement.conditionValue;

  if (requirement.conditionOperator === "EQUALS") {
    return String(actual ?? "") === String(expected ?? "");
  }
  if (requirement.conditionOperator === "NOT_EQUALS") {
    return String(actual ?? "") !== String(expected ?? "");
  }

  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (Number.isNaN(actualNumber) || Number.isNaN(expectedNumber)) {
    return false;
  }
  if (requirement.conditionOperator === "GREATER_THAN") {
    return actualNumber > expectedNumber;
  }
  if (requirement.conditionOperator === "LESS_THAN") {
    return actualNumber < expectedNumber;
  }
  return true;
}
