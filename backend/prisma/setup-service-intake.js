import { createHash } from "node:crypto";

// Intake questions for the agency's review, not universal consular rules.
// Existing administrator questions (including disabled ones) are preserved.
import { SERVICE_INTAKE_PROFILES } from "../src/modules/requirements/service-intake-profiles.js";
export { SERVICE_INTAKE_PROFILES };

export function intakeRequirementId(parentId, key) {
  return `service_intake_${createHash("md5").update(`${parentId}:${key}`).digest("hex")}`;
}

export async function ensureIntakeProfile(db, profile) {
  const parent = await db[profile.model].findUnique({ where: { code: profile.code }, select: { id: true } });
  if (!parent) return 0;
  const scope = profile.model === "service" ? { serviceId: parent.id } : { visaTypeId: parent.id };
  let created = 0;
  for (const [index, field] of profile.fields.entries()) {
    const existing = await db.visaRequirement.findFirst({ where: { ...scope, OR: [
      { attachmentType: field.key }, { name: { in: [field.name, ...field.aliases], mode: "insensitive" } },
    ] } });
    if (existing) continue;
    await db.visaRequirement.upsert({ where: { id: intakeRequirementId(parent.id, field.key) }, update: {}, create: {
      id: intakeRequirementId(parent.id, field.key), ...scope, name: field.name, description: field.description,
      attachmentType: field.key, type: field.type, scope: "CASE", required: field.required,
      ...(field.options ? { options: field.options } : {}), sortOrder: index + 1, active: true, ocrEnabled: false,
    } });
    created++;
  }
  return created;
}

export async function ensureServiceIntakeProfiles(db) {
  let created = 0;
  for (const profile of SERVICE_INTAKE_PROFILES) created += await ensureIntakeProfile(db, profile);
  // Only future checklists change: submitted request snapshots remain intact.
  const visas = await db.visaType.findMany({ where: { code: { in: ["VISA-WORK", "VISA-INTERNATIONAL"] } }, select: { id: true } });
  const rows = await db.visaRequirement.findMany({ where: { visaTypeId: { in: visas.map(v => v.id) }, type: "DOCUMENT", scope: { not: "TRAVELER" } }, select: { id: true, name: true, attachmentType: true } });
  const ids = rows.filter(r => /passport|photo|portrait|جواز|الصورة\s+الشخصية/i.test(`${r.attachmentType || ""} ${r.name}`)).map(r => r.id);
  if (ids.length) await db.visaRequirement.updateMany({ where: { id: { in: ids } }, data: { scope: "TRAVELER" } });
  return { created, travelerScoped: ids.length };
}
