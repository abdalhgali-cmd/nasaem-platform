import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

// The Service Intake wizard submits multipart/form-data (to attach document
// files alongside the rest of the form in one request), where every field
// arrives as a string — so JSON-shaped fields (intakeData, documentLabels)
// arrive JSON-encoded and need parsing first. The plain JSON contact form
// (application/json) already hands these as native arrays/objects, in which
// case this is a no-op. On unparsable input, the raw string is returned
// unchanged so the schema below reports a normal validation error instead
// of throwing.
function parseIfJsonString(value) {
  if (typeof value !== "string" || value === "") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const createContactRequestSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
  email: z.string().trim().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
  service: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().min(5, "الرسالة قصيرة جدًا").max(2000),
  // Honeypot field: real users never fill a visually-hidden input, so any
  // non-empty value here almost certainly means a bot filled the form.
  // Silently accepted (never surfaced as a validation error) so bots can't
  // learn to probe around it.
  website: z.string().optional(),
  // Everything below is optional and only ever sent by the Service Intake
  // wizard (Umrah/Visas/Packages) — the original free-text contact form
  // never sends these, and the request is created exactly as before when
  // they're absent.
  serviceId: z.string().trim().min(1).optional().or(z.literal("")),
  visaTypeId: z.string().trim().min(1).optional().or(z.literal("")),
  travelerCount: z.coerce.number().int().positive().max(50).optional(),
  // Free-form structured answers from the wizard's "service data" step
  // (traveler list, package/visa-specific notes, ...) — intentionally
  // unstructured server-side (see schema.prisma's ContactRequest.intakeData
  // comment), just capped in size so it can't be used to smuggle arbitrary
  // amounts of data into the database.
  intakeData: z.preprocess(
    parseIfJsonString,
    z.record(z.string(), z.any()).optional()
  ),
  // Labels for each file in the `documents` upload, in the same order —
  // e.g. ["صورة الجواز", "الصورة الشخصية"]. Reuses the same per-document
  // label concept already used by contact-request-documents.validators.js.
  documentLabels: z.preprocess(
    parseIfJsonString,
    z.array(z.string().trim().min(1).max(120)).max(6).optional()
  ),
});

export const updateContactRequestStatusSchema = z
  .object({
    status: z.enum(["NEW", "CONTACTED", "CLOSED"]),
    outcome: z.enum(["COMPLETED", "REJECTED", "CANCELLED"]).optional(),
    outcomeNote: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  // outcome only makes sense once the request is actually closed — required
  // there, not accepted (silently or otherwise) anywhere else.
  .refine((data) => data.status !== "CLOSED" || Boolean(data.outcome), {
    message: "يرجى تحديد نتيجة الإغلاق",
    path: ["outcome"],
  });

export const createInvoiceSchema = z.object({
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

const optionalTrimmedString = (max) => z.string().trim().max(max).optional().or(z.literal(""));

// Structured schedule/fare fields for a Manual Flight Offer — every field is
// optional since the same offer mechanism is also used for non-flight
// carriers (e.g. a ferry), where none of this applies. See
// NASAEM_Flights_Hotels_Provider_Procurement_Checklist.md §18: this is a
// staff-entered offer, never a live provider fare.
const flightOfferDetailsSchema = z.object({
  flightNumber: optionalTrimmedString(20),
  origin: optionalTrimmedString(120),
  destination: optionalTrimmedString(120),
  departureDate: optionalTrimmedString(20),
  departureTime: optionalTrimmedString(10),
  arrivalDate: optionalTrimmedString(20),
  arrivalTime: optionalTrimmedString(10),
  stops: z.coerce.number().int().min(0).optional(),
  cabinClass: optionalTrimmedString(60),
  baggageAllowance: optionalTrimmedString(200),
  seatsAvailable: z.coerce.number().int().min(0).optional(),
  terms: optionalTrimmedString(2000),
});

export const createOfferSchema = z.object({
  carrier: z.string().trim().min(2, "يرجى تحديد الناقل/الجهة").max(120),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  flightDetails: flightOfferDetailsSchema.optional(),
  validUntil: z.coerce.date().optional(),
  // Staff-only — never returned to the customer-facing tracking API.
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});
