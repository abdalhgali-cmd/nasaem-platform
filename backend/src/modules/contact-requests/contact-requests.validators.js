import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

export const createContactRequestSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  phone: z.string().trim().min(6, "رقم الهاتف مطلوب").max(30),
  email: z.string().trim().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
  service: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().min(5, "الرسالة قصيرة جدًا").max(2000),
  // Honeypot field: real users never fill a visually-hidden input, so any
  // non-empty value here almost certainly means a bot filled the form.
  // Silently accepted (never surfaced as a validation error) so bots can't
  // learn to probe around it.
  website: z.string().optional(),
});

export const updateContactRequestStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]),
});

export const createInvoiceSchema = z.object({
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const createOfferSchema = z.object({
  carrier: z.string().trim().min(2, "يرجى تحديد الناقل/الجهة").max(120),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});
