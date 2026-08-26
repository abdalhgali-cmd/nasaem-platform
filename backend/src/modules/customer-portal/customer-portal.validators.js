import { z } from "zod";

export const createSelfOrderSchema = z.object({
  serviceId: z.string().min(1, "الخدمة مطلوبة"),
  visaTypeId: z.string().min(1).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  couponCode: z.string().trim().min(1).optional().nullable(),
});
