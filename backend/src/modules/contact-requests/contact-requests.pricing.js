import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";
import { calculateCustomerPrice } from "../../utils/pricing.js";

export const pricingPreviewSchema = z.object({
  sourceAmount: z.coerce.number().nonnegative(),
  exchangeRate: z.coerce.number().positive(),
  marginPercent: z.coerce.number().nonnegative().max(1000).default(0),
});

// Used when a staff member wants to turn a pricing calculation into the
// actual customer-facing quote. The final amount is always derived from the
// same calculator used by the preview endpoint; staff never submit the final
// price independently in this flow.
export const pricingQuoteSchema = pricingPreviewSchema.extend({
  currency: z.enum(SUPPORTED_CURRENCIES).default("SAR"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

// Multi-option pricing uses the same calculation but additionally identifies
// the carrier/option shown to the customer.
export const pricingOfferSchema = pricingQuoteSchema.extend({
  carrier: z.string().trim().min(2, "يرجى تحديد الناقل/الجهة").max(120),
});

export function previewContactRequestPrice(data) {
  return calculateCustomerPrice(data);
}

export function buildPricingDescription({ sourceAmount, exchangeRate, marginPercent, description }) {
  const formula = `التكلفة الأصلية: ${sourceAmount} | سعر الصرف: ${exchangeRate} | هامش الوكالة: ${marginPercent}%`;
  return [formula, description?.trim()].filter(Boolean).join("\n");
}
