import { z } from "zod";

export const createSupplierSchema = z.object({
  code: z.string().min(1, "Supplier code is required"),
  name: z.string().min(2, "Supplier name is required"),
  type: z.string().min(2, "Supplier type is required"),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  active: z.coerce.boolean().optional(),
  // Smart Case Operations — Release F. How work is actually handed to this
  // provider. Null (the default on every pre-existing supplier) simply
  // means "not a submission target" — such a supplier keeps working
  // exactly as before for order costing, it just can't be selected when
  // sending a case out.
  submissionChannel: z.enum(["EMAIL", "MANUAL_PORTAL", "API", "OFFLINE"]).optional().nullable(),
  submissionEmail: z.string().email().optional().nullable().or(z.literal("")),
  portalUrl: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  expectedProcessingDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
});

export const updateSupplierSchema = createSupplierSchema.partial();
