import { z } from "zod";

export const requestCodeSchema = z.object({
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
});

export const verifyCodeSchema = z.object({
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "رمز التحقق يجب أن يتكون من 6 أرقام"),
});

// Egypt Security Approval — second-stage travel/circular data. This is
// intentionally small and service-specific: the approval itself may be
// submitted months before travel, while this payload is only supplied when
// the customer later knows the trip details. The date is date-only because
// that is what the customer normally has to enter here; the service layer
// therefore uses a conservative 72-hour decision and never claims exact
// eligibility when the missing time-of-day could change the answer.
export const egyptTravelPlanSchema = z.object({
  entryMode: z.enum(["AIR", "BORDER"]),
  bookingStatus: z.enum(["EXISTING", "NEEDS_NASAEM"]),
  entryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الدخول غير صالح"),
});
