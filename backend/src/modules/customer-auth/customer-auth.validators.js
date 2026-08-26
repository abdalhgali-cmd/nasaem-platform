import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(128);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "الاسم الكامل مطلوب").max(200),
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
  email: z.string().trim().email("البريد الإلكتروني غير صحيح").max(200).optional().or(z.literal("")),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "رقم الهاتف أو البريد الإلكتروني مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const forgotPasswordSchema = z.object({
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
});

export const resetPasswordSchema = z.object({
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
  code: z.string().trim().length(6, "رمز التحقق غير صحيح"),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  email: z.string().trim().email("البريد الإلكتروني غير صحيح").max(200).optional().or(z.literal("")),
  passportNo: z.string().trim().max(50).optional().or(z.literal("")),
  nationality: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});
