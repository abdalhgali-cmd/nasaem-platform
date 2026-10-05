import { z } from "zod";
import { staffPasswordSchema } from "../../utils/staffPassword.js";

export const createUserSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional().nullable().or(z.literal("")),
  password: staffPasswordSchema,
  role: z.enum(["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"]).default("EMPLOYEE"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  branchId: z.string().optional().nullable(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"]),
});

export const resetPasswordSchema = z.object({
  newPassword: staffPasswordSchema.optional(),
});
