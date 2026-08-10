import { z } from "zod";
import { ORDER_PRIORITIES, SUPPORTED_CURRENCIES } from "../../utils/enums.js";

const orderItemSchema = z
  .object({
    serviceId: z.string().min(1, "Service is required"),
    quantity: z.coerce.number().int().positive().default(1),
    unitPrice: z.coerce.number().nonnegative(),
    discount: z.coerce.number().nonnegative().default(0),
  })
  // Without this, a discount larger than the line's own price drives the
  // item (and so the whole order) total negative — the first payment
  // recorded, however small, then satisfies totalPaid >= totalAmount and
  // the order is marked PAID despite no real money having been collected.
  .refine((item) => item.discount <= item.unitPrice * item.quantity, {
    message: "Discount cannot exceed the item's total price",
    path: ["discount"],
  });

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  assignedUserId: z.string().min(1).optional().nullable(),
  branchId: z.string().min(1).optional().nullable(),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  priority: z.enum(ORDER_PRIORITIES).default("NORMAL"),
  items: z.array(orderItemSchema).min(1, "At least one order item is required"),
});

export const assignOrderSchema = z.object({
  assignedUserId: z.string().min(1).nullable(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "NEW",
    "UNDER_REVIEW",
    "WAITING_DOCUMENTS",
    "PAYMENT_PENDING",
    "PROCESSING",
    "APPROVED",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
  ]),
  notes: z.string().optional(),
});
