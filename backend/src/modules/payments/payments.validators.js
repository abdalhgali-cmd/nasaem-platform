import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

export const createPaymentSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  paymentMethod: z.string().min(2, "Payment method is required"),
  referenceNumber: z.string().optional().nullable(),
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "REFUNDED"]).default("PAID"),
  paidAt: z.string().datetime().optional().or(z.string().min(1).optional()),
});
