import { z } from "zod";

// A catalog price as the database stores it (Decimal(12,2)): finite, not
// negative, at most two decimals and within the column. Without these, a
// FIXED price of 0.001 passed the "greater than zero" rule and was stored as
// 0.00, and a huge value failed in the database with a 500.
export const MAX_CATALOG_PRICE = 9_999_999_999.99;

export const catalogPriceSchema = z.coerce
  .number()
  .finite()
  .nonnegative()
  .max(MAX_CATALOG_PRICE, "السعر أكبر من الحد المسموح")
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, "السعر يقبل خانتين عشريتين على الأكثر");
