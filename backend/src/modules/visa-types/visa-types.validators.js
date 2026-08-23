import { z } from "zod";
import { SUPPORTED_CURRENCIES, VISA_ENTRY_TYPES } from "../../utils/enums.js";

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
  sortOrder: z.coerce.number().int().optional(),
});

export const updateVisaTypeSchema = createVisaTypeSchema.partial();

export const reorderVisaTypesSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

// Deliberately a plain array of MIME strings (image/jpeg, application/pdf,
// ...) validated only by shape here — Phase 6 (Attachment Engine) is what
// actually enforces this list against real uploads.
const mimeTypeList = z.array(z.string().trim().min(1).max(100)).max(20).optional();

export const createVisaRequirementSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  required: z.coerce.boolean().optional(),
  attachmentType: z.string().trim().max(100).optional().nullable(),
  maxFiles: z.coerce.number().int().positive().max(50).optional(),
  allowedMimeTypes: mimeTypeList,
  maxSizeBytes: z.coerce.number().int().positive().optional().nullable(),
  reviewRequired: z.coerce.boolean().optional(),
  ocrEnabled: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  active: z.coerce.boolean().optional(),
});

export const updateVisaRequirementSchema = createVisaRequirementSchema.partial();
