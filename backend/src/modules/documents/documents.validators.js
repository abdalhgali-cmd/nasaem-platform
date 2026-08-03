import { z } from "zod";

export const createDocumentSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  customerId: z.string().min(1, "Customer is required"),
  uploadedById: z.string().min(1, "Uploader is required"),
  type: z.enum(["PASSPORT", "PHOTO", "VISA", "TICKET", "RECEIPT", "OTHER"]),
  fileName: z.string().min(1, "File name is required"),
  storagePath: z.string().min(1, "Storage path is required"),
  mimeType: z.string().optional().nullable(),
  sizeBytes: z.coerce.number().int().nonnegative().optional().nullable(),
});
