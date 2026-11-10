import { isUmrahServiceCategory } from "./umrah-guarantor.js";

export const UMRAH_PASSPORT_TYPE = "umrah_passport";
export function isPassportRequirement(row) {
  if ((row.type || "DOCUMENT") !== "DOCUMENT") return false;
  if (row.attachmentType === UMRAH_PASSPORT_TYPE) return true;
  const text = `${row.attachmentType || ""} ${row.name || ""}`;
  return /passport|جواز/i.test(text) && !/ضامن|كفيل|guarantor|sponsor/i.test(text);
}

export async function ensureUmrahPassportRequirement(db, serviceId) {
  const candidates = await db.visaRequirement.findMany({ where: { serviceId, type: "DOCUMENT", OR: [
    { attachmentType: { contains: "passport", mode: "insensitive" } },
    { name: { contains: "جواز" } }, { name: { contains: "passport", mode: "insensitive" } },
  ] }, orderBy: { createdAt: "asc" } });
  const existing = candidates.find(isPassportRequirement);
  const mandatory = { required: true, active: true, type: "DOCUMENT", scope: "TRAVELER", attachmentType: UMRAH_PASSPORT_TYPE,
    conditionRequirementId: null, conditionOperator: null, conditionValue: null };
  if (existing) return db.visaRequirement.update({ where: { id: existing.id }, data: mandatory });
  return db.visaRequirement.create({ data: { serviceId, name: "جواز سفر المعتمر", description: "صورة واضحة لصفحة بيانات جواز كل معتمر.",
    ...mandatory, maxFiles: 1, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxSizeBytes: 10 * 1024 * 1024, reviewRequired: true, ocrEnabled: false, sortOrder: 10 } });
}

// Only new Umrah intake is gated. Existing submitted requests and snapshots
// are untouched. A passport must be linked to its own named traveler.
export function validateUmrahPassports(category, { travelers, travelerCount, requirements, documents }) {
  if (!isUmrahServiceCategory(category)) return null;
  const expected = travelerCount == null ? travelers.length : Number(travelerCount);
  if (!travelers.length || travelers.length !== expected || travelers.some(t => !t.fullName?.trim())) {
    return { error: "UMRAH_TRAVELERS_REQUIRED" };
  }
  const passportIds = new Set((requirements || []).filter(r => isPassportRequirement(r) && r.required && r.scope === "TRAVELER").map(r => r.id));
  const missing = travelers.flatMap((_, index) => documents.some(d => passportIds.has(d.requirementId) && d.travelerIndex === index) ? [] : [index]);
  return missing.length ? { error: "UMRAH_PASSPORT_REQUIRED", details: { travelerIndexes: missing } } : null;
}
