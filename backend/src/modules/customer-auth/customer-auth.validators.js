import { z } from "zod";

export const requestCodeSchema = z.object({
  phone: z.string().trim().min(6).max(30),
});

export const verifyCodeSchema = z.object({
  loginCodeId: z.string().trim().min(1),
  code: z.string().trim().regex(/^\d{6}$/, "Code must be 6 digits"),
});
