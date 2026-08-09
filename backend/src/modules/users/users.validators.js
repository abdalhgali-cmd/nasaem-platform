import { z } from "zod";

export const createUserSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional().nullable().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"]).default("EMPLOYEE"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  branchId: z.string().optional().nullable(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const resetUserPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
