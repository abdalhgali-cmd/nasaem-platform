// One contract for new Egypt applications on both intake paths. No document
// or extracted OCR value substitutes for the traveler's reviewed facts.
export function validateEgyptIntake({ name, phone, travelers = [], travelerCount, requirements = [], documents = [], now = new Date() }) {
  const fields = new Set();
  const travelerIssues = [];
  if (!name?.trim()) fields.add("name");
  if (!phone?.trim()) fields.add("phone");
  const expected = travelerCount == null ? travelers.length : Number(travelerCount);
  if (!travelers.length || expected !== travelers.length) fields.add("travelers");
  const passportIds = new Set((requirements || []).filter(r => r.type === "DOCUMENT" && r.attachmentType === "passport_copy" && r.scope === "TRAVELER").map(r => r.id));
  const today = now.toISOString().slice(0, 10);
  travelers.forEach((traveler, index) => {
    const missing = [];
    if (!traveler?.fullName?.trim()) missing.push("fullName");
    if (!traveler?.passportNo?.trim()) missing.push("passportNo");
    const day = typeof traveler?.birthDate === "string" ? traveler.birthDate : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + "T00:00:00Z") : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day || day > today) missing.push("birthDate");
    if (!documents.some(d => !d.supersededAt && passportIds.has(d.requirementId) && d.travelerIndex === index)) missing.push("passportDocument");
    missing.forEach(field => fields.add(field));
    if (missing.length) travelerIssues.push({ index, fields: missing });
  });
  return fields.size ? { error: "EGYPT_CLEARANCE_INCOMPLETE", details: { fields: [...fields], travelerIssues } } : null;
}
