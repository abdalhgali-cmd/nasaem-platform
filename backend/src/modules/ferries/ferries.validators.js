import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";

export const createOperatorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).optional().nullable(),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const updateOperatorSchema = createOperatorSchema.partial();

export const createScheduleSchema = z.object({
  origin: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(120),
  travelDate: z.coerce.date(),
  departureTime: z.string().trim().max(20).optional().nullable(),
  arrivalTime: z.string().trim().max(20).optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().optional().nullable(),
  basePrice: z.coerce.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  capacity: z.coerce.number().int().positive().optional().nullable(),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial();
