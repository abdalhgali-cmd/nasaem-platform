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

// Staff-set price for a request with no catalog price (e.g. a work visa,
// priced case-by-case once staff has reviewed the submitted contract) —
// this is what actually starts the bank-transfer flow for anything other
// than an Umrah package, which prices itself automatically at submission.
export const approveContactRequestPaymentSchema = z.object({
  currency: z.enum(["SAR", "SDG", "USD"]),
  paymentAmount: z.coerce.number().positive(),
});

export const updateDocumentStatusSchema = z
  .object({
    status: z.enum(["ACCEPTED", "REJECTED"]),
    rejectionReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((data) => data.status !== "REJECTED" || !!data.rejectionReason, {
    message: "سبب الرفض مطلوب",
    path: ["rejectionReason"],
  });

// One flight/ferry segment of a staff-proposed offer — carrier is
// required (the entire point of this feature is pricing that varies by
// carrier), from/to are free text (not FK'd to any route catalog).
const tripLegSchema = z.object({
  carrierId: z.string().min(1, "اختر الناقل"),
  direction: z.enum(["OUTBOUND", "RETURN"]).default("OUTBOUND"),
  tripNumber: z.string().trim().max(30).optional().or(z.literal("")),
  departureAt: z.string().datetime().optional().or(z.literal("")),
  arrivalAt: z.string().datetime().optional().or(z.literal("")),
  fromLocation: z.string().trim().min(1, "نقطة الانطلاق مطلوبة").max(120),
  toLocation: z.string().trim().min(1, "الوجهة مطلوبة").max(120),
});

// Same currency set as approveContactRequestPaymentSchema above — not the
// unrelated 7-currency SUPPORTED_CURRENCIES from utils/enums.js, which
// backs the internal Order/promotional-Offer system.
export const createContactRequestOfferSchema = z.object({
  currency: z.enum(["SAR", "SDG", "USD"]),
  amount: z.coerce.number().positive(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  legs: z.array(tripLegSchema).min(1, "أضف رحلة واحدة على الأقل"),
});

// Editing always resends the full leg list (see updateContactRequestOffer
// in the service layer, which replaces all legs rather than diffing them).
export const updateContactRequestOfferSchema = createContactRequestOfferSchema;

// Membership against a request's own department is checked in the service
// layer (isValidExecutionStageForDepartment) — this only validates that
// `stage` is a real ContactRequestExecutionStage value at all.
export const updateExecutionStageSchema = z.object({
  stage: z.enum([
    "AWAITING_EXECUTION",
    "IN_PROGRESS",
    "SUBMITTED_TO_AUTHORITY",
    "VISA_ISSUED",
    "VISA_REJECTED",
    "TICKETS_BOOKED",
    "TICKETS_ISSUED",
    "UMRAH_DOCUMENTS_PREPARED",
    "UMRAH_PACKAGE_READY",
    "BOOKING_CONFIRMED_WITH_SUPPLIER",
    "VOUCHER_ISSUED",
    "DELIVERED_TO_CUSTOMER",
    "CANCELLED",
  ]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
