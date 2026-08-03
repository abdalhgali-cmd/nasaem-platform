import { z } from "zod";

const orderItemSchema = z.object({
  serviceId: z.string().min(1, "Service is required"),
  quantity: z.coerce.number().int().positive().default(1),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().default(0),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  assignedUserId: z.string().min(1).optional().nullable(),
  branchId: z.string().min(1).optional().nullable(),
  currency: z.string().min(2).default("SAR"),
  priority: z.string().default("NORMAL"),
  items: z.array(orderItemSchema).min(1, "At least one order item is required"),
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
