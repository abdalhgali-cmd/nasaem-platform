import { z } from "zod";

export const createPaymentAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  accountName: z.string().trim().min(2).max(160),
  accountNumber: z.string().trim().max(80).optional().or(z.literal("")),
  iban: z.string().trim().max(80).optional().or(z.literal("")),
  currency: z.string().trim().min(3).max(10),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export const updatePaymentAccountSchema = createPaymentAccountSchema.partial();
