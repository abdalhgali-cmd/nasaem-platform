import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

export const createPaymentSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  // Omitted => the order's own currency (resolved in the service).
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  // Order-currency units per 1 unit of `currency`. Required when `currency`
  // differs from the order's; it is stored as an immutable snapshot.
  fxRate: z.coerce.number().positive("fxRate must be greater than zero").max(1_000_000_000).optional().nullable(),
  paymentMethod: z.string().min(2, "Payment method is required"),
  referenceNumber: z.string().optional().nullable(),
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "REFUNDED"]).default("PAID"),
  paidAt: z.string().datetime().optional().or(z.string().min(1).optional()),
  // When true, the payment is recorded as awaiting review (UNPAID until a
  // staff member explicitly confirms it) instead of counted immediately.
  pendingReview: z.coerce.boolean().optional(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(3, "Rejection reason is required"),
});
