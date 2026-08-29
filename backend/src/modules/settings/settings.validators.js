import { z } from "zod";
import { PUBLIC_SETTING_KEYS } from "./settings.service.js";

export const upsertSettingSchema = z.object({
  key: z.enum(PUBLIC_SETTING_KEYS, {
    errorMap: () => ({ message: "Only approved public setting keys can be edited here" }),
  }),
  value: z.string().min(1, "Value is required"),
});
