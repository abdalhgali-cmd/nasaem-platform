import { z } from "zod";

// Smart Case Operations — Release F.
export const createProviderSubmissionSchema = z.object({
  supplierId: z.string().trim().min(1, "يرجى اختيار الجهة").max(60),
  documentIds: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  // Sending an internal/financial document to an external provider is
  // never the default — it takes this explicit flag, and the attempt is
  // logged either way (see provider-submissions.service.js).
  allowRestrictedDocuments: z.coerce.boolean().optional(),
});

export const completeProviderSubmissionSchema = z.object({
  externalReference: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
