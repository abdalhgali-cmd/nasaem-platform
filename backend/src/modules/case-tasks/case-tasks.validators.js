import { z } from "zod";

// Smart Case Operations — Release E.
export const createCaseTaskSchema = z.object({
  title: z.string().trim().min(2, "يرجى كتابة عنوان المهمة").max(200),
  type: z.enum(["REVIEW_DOCUMENTS", "CHECK_PAYMENT", "PROCESS_APPLICATION", "FOLLOW_UP_PROVIDER", "OTHER"]).optional(),
  assignedUserId: z.string().trim().min(1).max(60).optional().nullable(),
  dueAt: z.string().trim().max(40).optional().nullable(),
});
