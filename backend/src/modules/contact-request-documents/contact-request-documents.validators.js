import { z } from "zod";

// Device-measured image-quality hints (JSON in a multipart field); sanitized
// by egypt-clearance/document-quality.js, never trusted as-is.
const qualityField = z
  .union([z.string().max(4000), z.record(z.string(), z.any())])
  .optional()
  .transform((value) => {
    if (!value || typeof value !== "string") return value || undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  });

export const uploadContactRequestDocumentSchema = z.object({
  label: z.string().trim().min(2, "يرجى تحديد نوع المستند").max(120),
  quality: qualityField,
  // Platform 3.0 Phase 6 — optional link to the VisaRequirement checklist
  // item this upload satisfies. Omitted entirely for uploads that aren't
  // tied to a formal checklist (kept working exactly as before).
  requirementId: z.string().trim().min(1).optional(),
  // Smart Case Operations — Release A — which traveler this document
  // belongs to (must be a traveler on this same contact request — checked
  // in contact-request-documents.service.js, never trusted from the client
  // alone). Omitted for a case/customer-scoped document.
  travelerId: z.string().trim().min(1).optional(),
});

export const reviewContactRequestDocumentSchema = z
  .object({
    status: z.enum(["ACCEPTED", "REJECTED"]),
    reviewNote: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((data) => data.status !== "REJECTED" || Boolean(data.reviewNote), {
    message: "يرجى توضيح سبب الرفض حتى يعرف العميل ماذا يصحح",
    path: ["reviewNote"],
  });
