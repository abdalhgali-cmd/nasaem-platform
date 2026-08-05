import { z } from "zod";

export const createSupplierSchema = z.object({
  code: z.string().min(1, "Supplier code is required"),
  name: z.string().min(2, "Supplier name is required"),
  type: z.string().min(2, "Supplier type is required"),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  active: z.coerce.boolean().optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();
