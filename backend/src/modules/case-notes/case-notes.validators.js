import { z } from "zod";

export const createCaseNoteSchema = z.object({
  body: z.string().trim().min(2, "يرجى كتابة الملاحظة").max(4000),
});
