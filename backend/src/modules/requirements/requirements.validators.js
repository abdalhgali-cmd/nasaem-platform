import { z } from "zod";

// Deliberately a plain array of MIME strings (image/jpeg, application/pdf,
// ...) validated only by shape here — the attachment engine
// (contact-request-documents.service.js) is what actually enforces this
// list against real uploads.
const mimeTypeList = z.array(z.string().trim().min(1).max(100)).max(20).optional();

// Smart Case Operations — Release A. A SELECT requirement's choices — kept
// as a plain array of {value,label}, not a separate table, since nothing
// here needs its own identity/ordering beyond the array position.
const optionsList = z
  .array(
    z.object({
      value: z.string().trim().min(1).max(100),
      label: z.string().trim().min(1).max(200),
    })
  )
  .max(50)
  .optional()
  .nullable();

// Kept as a plain shape object (not already wrapped in z.object()) so both
// schemas below can independently call .partial()/.refine() on it — Zod
// drops an object schema's own .refine() as soon as it's re-wrapped (e.g.
// .partial()), so each schema re-applies the same condition rule itself
// rather than one trying to derive from the other.
const requirementShape = {
  name: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  required: z.coerce.boolean().optional(),
  attachmentType: z.string().trim().max(100).optional().nullable(),
  maxFiles: z.coerce.number().int().positive().max(50).optional(),
  allowedMimeTypes: mimeTypeList,
  maxSizeBytes: z.coerce.number().int().positive().optional().nullable(),
  reviewRequired: z.coerce.boolean().optional(),
  ocrEnabled: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  active: z.coerce.boolean().optional(),
  type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "YES_NO", "DOCUMENT"]).optional(),
  scope: z.enum(["CUSTOMER", "TRAVELER", "CASE"]).optional(),
  options: optionsList,
  // Condition fields travel together: either all three are set (this
  // requirement only applies when conditionRequirementId's submitted
  // answer relates to conditionValue by conditionOperator) or none are —
  // enforced by the refine() below rather than allowing a half-set rule
  // that could never evaluate to anything.
  conditionRequirementId: z.string().trim().min(1).max(60).optional().nullable(),
  conditionOperator: z.enum(["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN"]).optional().nullable(),
  conditionValue: z.string().trim().max(200).optional().nullable(),
};

function requireConditionTogether(data) {
  const parts = [data.conditionRequirementId, data.conditionOperator, data.conditionValue];
  const setCount = parts.filter((p) => p !== undefined && p !== null && p !== "").length;
  return setCount === 0 || setCount === 3;
}
const CONDITION_REFINE_OPTS = {
  message: "Condition requires requirement, operator and value together",
  path: ["conditionOperator"],
};

export const createRequirementSchema = z.object(requirementShape).refine(requireConditionTogether, CONDITION_REFINE_OPTS);

export const updateRequirementSchema = z
  .object(requirementShape)
  .partial()
  .refine(requireConditionTogether, CONDITION_REFINE_OPTS);
