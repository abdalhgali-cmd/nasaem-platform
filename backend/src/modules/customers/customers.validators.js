import { z } from "zod";

export const createCustomerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  passportNo: z.string().min(4, "Passport number is required"),
  nationality: z.string().min(2, "Nationality is required"),
  birthDate: z.string().datetime().optional().or(z.string().min(1).optional()),
  gender: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  country: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
