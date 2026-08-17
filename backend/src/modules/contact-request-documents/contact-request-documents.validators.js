import { z } from "zod";

export const uploadContactRequestDocumentSchema = z.object({
  label: z.string().trim().min(2, "يرجى تحديد نوع المستند").max(120),
});

export const reviewContactRequestDocumentSchema = z
  .object({
    status: z.enum(["ACCEPTED", "REJECTED"]),
    reviewNote: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((data) => data.status !== "REJECTED" || Boolean(data.reviewNote), {
    message: "يرجى توضيح سبب الرفض حتى يعرف العميل ماذا يصحح",
    path: ["reviewNote"],
  });
