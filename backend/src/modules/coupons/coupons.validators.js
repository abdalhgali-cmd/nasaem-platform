import { z } from "zod";

const codeSchema = z
  .string()
  .trim()
  .min(3, "رمز الكوبون يجب أن يكون 3 أحرف على الأقل")
  .max(40)
  .transform((value) => value.toUpperCase());

export const createCouponSchema = z
  .object({
    code: codeSchema,
    description: z.string().trim().max(500).optional().or(z.literal("")),
    discountType: z.enum(["PERCENTAGE", "FIXED"]),
    discountValue: z.coerce.number().positive("قيمة الخصم يجب أن تكون أكبر من صفر"),
    startDate: z.coerce.date().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    active: z.coerce.boolean().optional(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    usageLimitPerCustomer: z.coerce.number().int().positive().optional().nullable(),
    minOrderAmount: z.coerce.number().nonnegative().optional().nullable(),
    serviceId: z.string().optional().nullable(),
    visaTypeId: z.string().optional().nullable(),
    newCustomersOnly: z.coerce.boolean().optional(),
    customerId: z.string().optional().nullable(),
  })
  .refine((data) => data.discountType !== "PERCENTAGE" || data.discountValue <= 100, {
    message: "نسبة الخصم لا يمكن أن تتجاوز 100%",
    path: ["discountValue"],
  })
  .refine((data) => !data.startDate || !data.expiryDate || data.startDate <= data.expiryDate, {
    message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء",
    path: ["expiryDate"],
  });

export const updateCouponSchema = z
  .object({
    description: z.string().trim().max(500).optional().or(z.literal("")),
    discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
    discountValue: z.coerce.number().positive().optional(),
    startDate: z.coerce.date().optional().nullable(),
    expiryDate: z.coerce.date().optional().nullable(),
    active: z.coerce.boolean().optional(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    usageLimitPerCustomer: z.coerce.number().int().positive().optional().nullable(),
    minOrderAmount: z.coerce.number().nonnegative().optional().nullable(),
    serviceId: z.string().optional().nullable(),
    visaTypeId: z.string().optional().nullable(),
    newCustomersOnly: z.coerce.boolean().optional(),
    customerId: z.string().optional().nullable(),
  })
  .refine((data) => data.discountType !== "PERCENTAGE" || data.discountValue === undefined || data.discountValue <= 100, {
    message: "نسبة الخصم لا يمكن أن تتجاوز 100%",
    path: ["discountValue"],
  });

export const validateCouponSchema = z.object({
  code: codeSchema,
  serviceId: z.string().optional().nullable(),
  visaTypeId: z.string().optional().nullable(),
  orderAmount: z.coerce.number().nonnegative(),
});
