import { z } from "zod";

// Deliberately a plain array of MIME strings (image/jpeg, application/pdf,
// ...) validated only by shape here — the attachment engine
// (contact-request-documents.service.js) is what actually enforces this
// list against real uploads.
const mimeTypeList = z.array(z.string().trim().min(1).max(100)).max(20).optional();

export const createRequirementSchema = z.object({
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

export const updateRequirementSchema = createRequirementSchema.partial();
