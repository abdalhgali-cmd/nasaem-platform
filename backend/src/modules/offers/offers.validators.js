import { z } from "zod";

export const createOfferSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  price: z.coerce.number().nonnegative(),
  currency: z.string().min(2).default("SAR"),
  startDate: z.string().datetime().optional().or(z.string().min(1).optional()),
  endDate: z.string().datetime().optional().or(z.string().min(1).optional()),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
});
