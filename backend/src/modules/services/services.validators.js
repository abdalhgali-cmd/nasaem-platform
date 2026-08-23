import { z } from "zod";
import { ICON_KEYS, SUPPORTED_CURRENCIES } from "../../utils/enums.js";

const featuresSchema = z.array(z.string().trim().min(1).max(200)).max(20).optional().nullable();

export const createServiceSchema = z.object({
  code: z.string().min(1, "Service code is required"),
  name: z.string().min(2, "Service name is required"),
  category: z.string().min(2, "Category is required"),
  description: z.string().optional().nullable(),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  iconKey: z.enum(ICON_KEYS).optional().nullable(),
  features: featuresSchema,
});

export const updateServiceSchema = createServiceSchema.partial();

export const reorderServicesSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});
