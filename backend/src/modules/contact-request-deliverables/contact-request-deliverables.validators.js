import { z } from "zod";

export const uploadContactRequestDeliverableSchema = z.object({
  label: z.string().trim().min(2, "يرجى تحديد اسم الملف").max(120),
});
