import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

const idempotencyKey = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/, "Invalid idempotency key").optional();

export const createPaymentSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  // Omitted -> the order's own currency (never a silent SAR default).
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  paymentMethod: z.string().trim().min(2, "Payment method is required").max(100),
  referenceNumber: z.string().max(120).optional().nullable(),
  // A payment row records money received. "Partial" is a property of the
  // ORDER (net paid < total), never of a payment, and refunds have their own
  // endpoint (POST /payments/:id/refund). Only PAID is accepted here.
  status: z
    .string()
    .optional()
    .refine((value) => value === undefined || value === "PAID", {
      message: "حالة الدفعة غير صالحة: سجّل المبلغ المستلم فقط (الدفع الجزئي يُحسب تلقائيًا، والاسترجاع له إجراء مستقل).",
    }),
  paidAt: z.string().datetime().optional().or(z.string().min(1).optional()),
  // When true, the payment is recorded as awaiting review (not counted as
  // received until a staff member confirms it).
  pendingReview: z.coerce.boolean().optional(),
  idempotencyKey,
});

export const refundPaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  reason: z.string().trim().min(3, "سبب الاسترجاع مطلوب").max(500),
  idempotencyKey,
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(3, "Rejection reason is required"),
});
