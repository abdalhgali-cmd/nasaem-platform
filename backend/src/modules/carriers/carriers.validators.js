import { z } from "zod";

export const createCarrierSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  mode: z.enum(["AIR", "SEA"]),
  code: z.string().trim().max(20).optional().or(z.literal("")),
  active: z.boolean().optional().default(true),
});

export const updateCarrierSchema = createCarrierSchema.partial();
