// Pure pricing calculator used by service-specific pricing flows.
// Keeps supplier cost, FX conversion, margin, and customer price explicit.

function assertFiniteNonNegative(name, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  return number;
}

/**
 * Calculate a customer-facing price from a source amount.
 *
 * sourceAmount: amount in the source currency.
 * exchangeRate: target/source. Example: 1 USD -> 600 SDG means 600.
 * marginPercent: markup applied after FX conversion.
 */
export function calculateCustomerPrice({ sourceAmount, exchangeRate = 1, marginPercent = 0 }) {
  const amount = assertFiniteNonNegative("sourceAmount", sourceAmount);
  const rate = assertFiniteNonNegative("exchangeRate", exchangeRate);
  const margin = assertFiniteNonNegative("marginPercent", marginPercent);

  const convertedCost = amount * rate;
  const marginAmount = convertedCost * (margin / 100);
  const customerPrice = convertedCost + marginAmount;

  return {
    sourceAmount: amount,
    exchangeRate: rate,
    marginPercent: margin,
    convertedCost: Number(convertedCost.toFixed(2)),
    marginAmount: Number(marginAmount.toFixed(2)),
    customerPrice: Number(customerPrice.toFixed(2)),
  };
}
