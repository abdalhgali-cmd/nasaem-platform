import prisma from "../../config/database.js";
import { isEgyptClearanceCode, resolveEgyptEntryMode } from "../egypt-clearance/egypt-clearance-variants.js";

// The public Egypt intake is intentionally stricter than a generic contact
// request. These are the facts required to start the security approval
// itself; travel date/ticket are deliberately absent because they belong to
// the later circular stage and may not exist for months.
export async function validateEgyptClearanceDraft(draft) {
  if (!draft?.visaTypeId) return null;

  const visaType = await prisma.visaType.findUnique({
    where: { id: draft.visaTypeId },
    select: { code: true },
  });
  if (!isEgyptClearanceCode(visaType?.code)) return null;

  const [passportRequirement, entryRequirement] = await Promise.all([
    prisma.visaRequirement.findFirst({
      where: {
        visaTypeId: draft.visaTypeId,
        active: true,
        attachmentType: "passport_copy",
      },
      select: { id: true },
    }),
    prisma.visaRequirement.findFirst({
      where: {
        visaTypeId: draft.visaTypeId,
        active: true,
        attachmentType: "egypt_entry_mode",
      },
      select: { id: true },
    }),
  ]);

  const traveler = Array.isArray(draft.travelers) ? draft.travelers[0] : null;
  const missing = [];

  if (!draft.name?.trim()) missing.push("name");
  if (!draft.phone?.trim()) missing.push("phone");
  if (!traveler?.passportNo?.trim()) missing.push("passportNo");
  if (!traveler?.birthDate) missing.push("birthDate");

  // A variant (air / border) fixes the entry method; the original item needs
  // the answer. A contradicting answer is refused on submission.
  const entry = resolveEgyptEntryMode(visaType.code, entryRequirement ? draft.answers?.[entryRequirement.id] : undefined);
  if (entry.error) return entry;
  if (!entry.entryMode) missing.push("entryMode");

  const hasPassport = Boolean(
    passportRequirement &&
      Array.isArray(draft.documents) &&
      draft.documents.some((document) => document.requirementId === passportRequirement.id)
  );
  if (!hasPassport) missing.push("passportDocument");

  if (missing.length === 0) return null;
  return {
    error: "EGYPT_CLEARANCE_INCOMPLETE",
    details: { fields: missing },
  };
}
