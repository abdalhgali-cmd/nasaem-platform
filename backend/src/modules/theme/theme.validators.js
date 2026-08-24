import { z } from "zod";
import { HEX_COLOR_REGEX } from "./theme.constants.js";

const hexColor = z.string().trim().regex(HEX_COLOR_REGEX, "must be a #RRGGBB hex color");

export const updateThemeSchema = z.object({
  primary: hexColor.optional().nullable(),
  secondary: hexColor.optional().nullable(),
  accent: hexColor.optional().nullable(),
  background: hexColor.optional().nullable(),
  text: hexColor.optional().nullable(),
  button: hexColor.optional().nullable(),
});
