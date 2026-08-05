import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

export const createServiceSchema = z.object({
  code: z.string().min(1, "Service code is required"),
  name: z.string().min(2, "Service name is required"),
  category: z.string().min(2, "Category is required"),
  description: z.string().optional().nullable(),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  active: z.coerce.boolean().optional(),
});

export const updateServiceSchema = createServiceSchema.partial();
