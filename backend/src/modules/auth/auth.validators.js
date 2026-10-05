import { z } from "zod";
import { staffPasswordSchema } from "../../utils/staffPassword.js";

export const loginSchema = z.object({
  email: z.string().email({ message: "Valid email is required" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required" }),
  newPassword: staffPasswordSchema,
});
