import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Group name is required"),
  travelDate: z.string().optional().nullable(),
  airline: z.string().trim().optional().nullable(),
  hotel: z.string().trim().optional().nullable(),
  transport: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const updateGroupSchema = createGroupSchema.partial();

export const addMemberSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  orderId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export const updateMemberSchema = z.object({
  orderId: z.string().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});
