import { z } from "zod";

export const reportsSummaryQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  department: z.enum(["VISAS", "FLIGHTS", "UMRAH", "HOTELS_PACKAGES", "FERRY"]).optional(),
});
