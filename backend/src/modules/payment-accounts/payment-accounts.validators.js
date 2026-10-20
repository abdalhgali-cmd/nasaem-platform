import { z } from "zod";

export const createPaymentAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  accountName: z.string().trim().min(2).max(160),
  accountNumber: z.string().trim().max(80).optional().or(z.literal("")),
  iban: z.string().trim().max(80).optional().or(z.literal("")),
  currency: z.string().trim().min(3).max(10),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  // SDG accounts only: the agency explicitly accepts the SDG equivalent frozen
  // on an invoice issued in another currency (payment-settlement.service.js).
  acceptsForeignInvoices: z.boolean().default(false),
});

export const updatePaymentAccountSchema = createPaymentAccountSchema.partial();

export const FOREIGN_SETTLEMENT_CURRENCY = "SDG";

// The flag only makes sense on an SDG account. Returns the value to store, or
// null when the request asks for it on another currency (refused).
export function foreignSettlementFlag(currency, requested, current = false) {
  if (currency !== FOREIGN_SETTLEMENT_CURRENCY) return requested === true ? null : false;
  return requested === undefined ? Boolean(current) : requested;
}
