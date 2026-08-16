import { z } from "zod";

export const requestCodeSchema = z.object({
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
});

export const verifyCodeSchema = z.object({
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "رمز التحقق يجب أن يتكون من 6 أرقام"),
});
