import { z } from "zod";
import { calculateCustomerPrice } from "../../utils/pricing.js";

export const pricingPreviewSchema = z.object({
  sourceAmount: z.coerce.number().nonnegative(),
  exchangeRate: z.coerce.number().positive(),
  marginPercent: z.coerce.number().nonnegative().max(1000).default(0),
});

export function previewContactRequestPrice(data) {
  return calculateCustomerPrice(data);
}
