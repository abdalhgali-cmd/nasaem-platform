import prisma from "../../config/database.js";
import { isEgyptClearanceCode, resolveEgyptEntryMode } from "../egypt-clearance/egypt-clearance-variants.js";
import { validateEgyptIntake } from "../egypt-clearance/egypt-intake-validation.js";

export async function validateEgyptClearanceDraft(draft) {
  if (!draft?.visaTypeId) {
    const service = draft?.serviceId ? await prisma.service.findUnique({ where: { id: draft.serviceId }, select: { category: true } }) : null;
    return service?.category === "egypt_clearance" ? { error: "EGYPT_VARIANT_REQUIRED" } : null;
  }
  const visaType = await prisma.visaType.findUnique({ where: { id: draft.visaTypeId }, select: { code: true } });
  if (!isEgyptClearanceCode(visaType?.code)) {
    const service = draft.serviceId ? await prisma.service.findUnique({ where: { id: draft.serviceId }, select: { category: true } }) : null;
    return service?.category === "egypt_clearance" ? { error: "EGYPT_VARIANT_REQUIRED" } : null;
  }
  const requirements = await prisma.visaRequirement.findMany({ where: { visaTypeId: draft.visaTypeId, active: true } });
  const question = requirements.find(r => r.attachmentType === "egypt_entry_mode");
  const entry = resolveEgyptEntryMode(visaType.code, question ? draft.answers?.[question.id] : undefined);
  if (entry.error) return entry;
  const refs = draft.documentTravelerRefs || {};
  const result = validateEgyptIntake({ ...draft, requirements, documents: (draft.documents || []).map(d => ({ ...d,
    travelerIndex: refs[d.id] == null || refs[d.id] === "" ? null : Number(refs[d.id]) })) });
  if (entry.entryMode) return result;
  const details = result?.details || { fields: [], travelerIssues: [] };
  return { error: "EGYPT_CLEARANCE_INCOMPLETE", details: { ...details, fields: ["entryMode", ...details.fields] } };
}
