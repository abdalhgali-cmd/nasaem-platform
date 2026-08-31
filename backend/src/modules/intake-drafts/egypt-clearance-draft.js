import prisma from "../../config/database.js";

const EGYPT_CLEARANCE_VISA_CODE = "VISA-EGYPT-CLEARANCE";
const ENTRY_VALUES = new Set(["AIR", "BORDER"]);

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
  if (visaType?.code !== EGYPT_CLEARANCE_VISA_CODE) return null;

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

  const entryMode = entryRequirement ? draft.answers?.[entryRequirement.id] : null;
  if (!entryRequirement || !ENTRY_VALUES.has(entryMode)) missing.push("entryMode");

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
