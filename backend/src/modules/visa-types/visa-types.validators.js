import { z } from "zod";
import { SUPPORTED_CURRENCIES, VISA_ENTRY_TYPES, VISA_TYPE_CATEGORIES } from "../../utils/enums.js";

export const createVisaTypeSchema = z.object({
  code: z.string().min(1, "Visa code is required"),
  name: z.string().min(2, "Visa name is required"),
  nameEn: z.string().trim().max(200).optional().nullable(),
  country: z.string().min(2, "Country is required"),
  description: z.string().optional().nullable(),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  active: z.coerce.boolean().optional(),
  serviceId: z.string().optional().nullable(),
  type: z.string().trim().max(100).optional().nullable(),
  processingTime: z.string().trim().max(100).optional().nullable(),
  stayDuration: z.string().trim().max(100).optional().nullable(),
  validity: z.string().trim().max(100).optional().nullable(),
  entryType: z.enum(VISA_ENTRY_TYPES).optional().nullable(),
  category: z.enum(VISA_TYPE_CATEGORIES).default("OTHER"),
  sortOrder: z.coerce.number().int().optional(),
});

export const updateVisaTypeSchema = createVisaTypeSchema.partial();

export const reorderVisaTypesSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});
