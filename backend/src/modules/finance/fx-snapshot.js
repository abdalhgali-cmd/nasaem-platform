import { getCurrencyRates } from "../flights/flights.service.js";

// The Sudanese-pound equivalent of a price, captured at the moment the price is
// issued. Stored next to the original amount and currency and never recomputed,
// so a rate change later cannot alter a price the customer already saw or
// approved. All three values are null when no rate is configured for the
// currency (the customer then sees only the original amount).
export function computeSdgSnapshot(currency, amount, rates, now = new Date()) {
  const code = String(currency || "").toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return { exchangeRateToSdg: null, amountSdg: null, rateFixedAt: null };
  const rate = code === "SDG" ? 1 : Number(rates?.[code] || 0);
  if (!Number.isFinite(rate) || rate <= 0) return { exchangeRateToSdg: null, amountSdg: null, rateFixedAt: null };
  return { exchangeRateToSdg: rate, amountSdg: Math.round(value * rate * 100) / 100, rateFixedAt: now };
}

export async function sdgSnapshot(currency, amount) {
  return computeSdgSnapshot(currency, amount, await getCurrencyRates());
}
