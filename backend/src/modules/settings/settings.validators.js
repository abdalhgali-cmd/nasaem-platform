import { z } from "zod";

export const upsertSettingSchema = z.object({
  key: z.string().min(2, "Key is required"),
  value: z.string().min(1, "Value is required"),
});
