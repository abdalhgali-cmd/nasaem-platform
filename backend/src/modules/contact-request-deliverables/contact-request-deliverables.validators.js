import { z } from "zod";

// travelerIds arrives as a JSON array in a multipart field (or a JSON body
// for publish): the travelers this final file is the output for.
export const travelerIdsField = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === "") return undefined;
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      // fall through
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "قائمة المسافرين غير صالحة" });
    return z.NEVER;
  });

const publishField = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .optional()
  .transform((value) => value === true || value === "true");

export const uploadContactRequestDeliverableSchema = z.object({
  label: z.string().trim().min(2, "يرجى تحديد اسم الملف").max(120),
  travelerIds: travelerIdsField,
  // false (the default): prepare the file as a draft, not visible to the
  // customer. true: publish it now (only after payment and execution).
  publish: publishField,
});

export const publishContactRequestDeliverableSchema = z.object({
  travelerIds: travelerIdsField,
});
