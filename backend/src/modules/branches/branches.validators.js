import { z } from "zod";

export const createBranchSchema = z.object({
  code: z.string().min(1, "Branch code is required"),
  name: z.string().min(2, "Branch name is required"),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  active: z.coerce.boolean().optional(),
});
