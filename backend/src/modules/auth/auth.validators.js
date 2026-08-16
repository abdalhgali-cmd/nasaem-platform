import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email({ message: "Valid email is required" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export const requestStaffPasswordResetSchema = z.object({
  email: z.string().trim().email(),
});

export const confirmStaffPasswordResetSchema = z.object({
  resetCodeId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
  // Same rule as resetUserPasswordSchema (users.validators.js).
  password: z.string().min(8, "Password must be at least 8 characters"),
});
