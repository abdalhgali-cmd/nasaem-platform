import { z } from "zod";

// fileName, storagePath, mimeType and sizeBytes are derived server-side from
// the uploaded file (see upload.middleware.js) rather than trusted from the
// client, and uploadedById is taken from the authenticated request user.
export const createDocumentSchema = z.object({
  orderId: z.string().min(1, "Order is required"),
  customerId: z.string().min(1, "Customer is required"),
  type: z.enum(["PASSPORT", "PHOTO", "VISA", "TICKET", "RECEIPT", "OTHER"]),
});
