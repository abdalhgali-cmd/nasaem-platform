import { z } from "zod";

// Structured fields from a service-specific request form (e.g. Umrah's
// "package type" + "travel date" + "pilgrim count"). Kept as a flat
// string-to-string map — display-only data for the staff dashboard, not
// business logic — so one schema covers every service without a union of
// per-service shapes.
const detailsSchema = z.record(z.string().trim().min(1).max(60), z.string().trim().min(1).max(300)).optional();

export const createContactRequestSchema = z
  .object({
    name: z.string().trim().min(2, "الاسم مطلوب").max(120),
    phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
    email: z.string().trim().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
    service: z.string().trim().max(120).optional().or(z.literal("")),
    // Free-text notes are optional now that a service form can submit
    // meaningful content entirely through `details` instead.
    message: z.string().trim().max(2000).optional().or(z.literal("")),
    details: detailsSchema,
    // Only meaningful for services with a known server-side price (see
    // UMRAH_PACKAGE_PRICES_SAR in the service layer) — anything else simply
    // ignores this and leaves the request's payment fields at NOT_REQUIRED.
    currency: z.enum(["SAR", "SDG", "USD"]).optional(),
    // Honeypot field: real users never fill a visually-hidden input, so any
    // non-empty value here almost certainly means a bot filled the form.
    // Silently accepted (never surfaced as a validation error) so bots can't
    // learn to probe around it.
    website: z.string().optional(),
  })
  .refine(
    (data) => (data.message && data.message.trim().length >= 5) || (data.details && Object.keys(data.details).length > 0),
    { message: "أدخل تفاصيل الطلب", path: ["message"] }
  );

export const updateContactRequestStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(["AWAITING_TRANSFER", "UNDER_REVIEW", "CONFIRMED"]),
});
