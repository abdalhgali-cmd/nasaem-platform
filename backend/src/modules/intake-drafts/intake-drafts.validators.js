import { z } from "zod";

// Smart Case Operations — Release B. Mirrors createContactRequestSchema's
// shapes/limits (contact-requests.validators.js) so a draft can never
// accumulate state the real submission endpoint would reject.

const travelerSchema = z.object({
  fullName: z.string().trim().max(200).optional().or(z.literal("")),
  passportNo: z.string().trim().max(50).optional().or(z.literal("")),
  nationality: z.string().trim().max(100).optional().or(z.literal("")),
  birthDate: z.string().trim().max(30).optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  isPrimary: z.coerce.boolean().optional(),
  // Set once the customer confirms an OCR-extracted identity for this
  // traveler — see the passport-first flow in the wizard. Purely
  // informational; the confirmed values live in the fields above.
  ocrConfirmed: z.coerce.boolean().optional(),
});

export const createDraftSchema = z.object({
  serviceKind: z.enum(["umrah", "visa", "package"]).optional(),
  serviceId: z.string().trim().min(1).max(60).optional().or(z.literal("")),
  visaTypeId: z.string().trim().min(1).max(60).optional().or(z.literal("")),
});

export const updateDraftSchema = z.object({
  serviceKind: z.enum(["umrah", "visa", "package"]).optional(),
  serviceId: z.string().trim().max(60).optional().or(z.literal("")),
  visaTypeId: z.string().trim().max(60).optional().or(z.literal("")),
  step: z.coerce.number().int().min(0).max(20).optional(),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().max(200).optional().or(z.literal("")),
  travelerCount: z.coerce.number().int().positive().max(50).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  travelers: z.array(travelerSchema).max(20).optional(),
});

export const addDraftDocumentSchema = z.object({
  label: z.string().trim().min(2, "يرجى تحديد نوع المستند").max(120),
  requirementId: z.string().trim().min(1).max(60).optional(),
  // Index into the draft's own `travelers` array — not a Traveler row id,
  // which doesn't exist until submission (see intake-drafts.service.js).
  travelerIndex: z.coerce.number().int().min(0).max(19).optional(),
});

export const submitDraftSchema = z.object({
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});
