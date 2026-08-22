import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../utils/enums.js";
import { calculateCustomerPrice } from "../../utils/pricing.js";
import { createCalculatedInvoice, createCalculatedOffer } from "./contact-requests.pricing.service.js";

const pricingPayloadSchema = z.object({
  sourceAmount: z.coerce.number().positive(),
  exchangeRate: z.coerce.number().positive(),
  marginPercent: z.coerce.number().nonnegative().max(1000).default(0),
  sourceCurrency: z.enum(SUPPORTED_CURRENCIES).default("USD"),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

const offerPayloadSchema = pricingPayloadSchema.extend({
  carrier: z.string().trim().min(2).max(120),
});

function parsePricing(body, schema) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { error: { status: 400, payload: { success: false, message: "Validation failed", errors: parsed.error.flatten() } } };
  }
  return { data: parsed.data, price: calculateCustomerPrice(parsed.data) };
}

export async function createPricingInvoice(req, res, next) {
  try {
    const parsed = parsePricing(req.body, pricingPayloadSchema);
    if (parsed.error) return res.status(parsed.error.status).json(parsed.error.payload);

    const result = await createCalculatedInvoice(req.params.id, parsed.data, parsed.price, req.user.id);
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });
    if (result.error === "ALREADY_APPROVED") return res.status(409).json({ success: false, message: "Customer has already approved this invoice" });
    if (result.error === "OFFERS_EXIST") return res.status(409).json({ success: false, message: "This request already uses multi-carrier offers" });

    return res.status(result.created ? 201 : 200).json({ success: true, data: result.invoice, pricing: parsed.price });
  } catch (error) {
    next(error);
  }
}

export async function createPricingOffer(req, res, next) {
  try {
    const parsed = parsePricing(req.body, offerPayloadSchema);
    if (parsed.error) return res.status(parsed.error.status).json(parsed.error.payload);

    const result = await createCalculatedOffer(req.params.id, parsed.data, parsed.price, req.user.id);
    if (result.error === "NOT_FOUND") return res.status(404).json({ success: false, message: "Contact request not found" });
    if (result.error === "INVOICE_EXISTS") return res.status(409).json({ success: false, message: "This request already uses a single invoice" });
    if (result.error === "ALREADY_SELECTED") return res.status(409).json({ success: false, message: "The customer has already selected an offer" });

    return res.status(201).json({ success: true, data: result.offer, pricing: parsed.price });
  } catch (error) {
    next(error);
  }
}
