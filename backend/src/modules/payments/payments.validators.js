import { z } from "zod";

export const createPaymentSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  currency: z.string().min(2).default("SAR"),
  paymentMethod: z.string().min(2, "Payment method is required"),
  referenceNumber: z.string().optional().nullable(),
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "REFUNDED"]).default("PAID"),
  paidAt: z.string().datetime().optional().or(z.string().min(1).optional()),
});
