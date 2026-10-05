import prismaPackage from "@prisma/client";

const { Prisma } = prismaPackage;

// All money arithmetic goes through Decimal (decimal.js via Prisma) — never
// JavaScript floats. Amounts are rounded half-up to 2 decimals, exactly once,
// at the point a foreign-currency amount is converted.

export const Decimal = Prisma.Decimal;
export const ZERO = new Decimal(0);

export function dec(value) {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === "") return ZERO;
  return new Decimal(typeof value === "number" ? String(value) : value);
}

export function round2(value) {
  return dec(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function money(value) {
  return round2(value).toFixed(2);
}

// amount (in the payment's currency) x fxRate (order-currency units per 1
// payment-currency unit) -> amount in the order's currency.
export function convertAmount(amount, fxRate) {
  return round2(dec(amount).mul(dec(fxRate)));
}

// Settlement position of ONE order, always in the order's own currency.
//   paid     = sum(converted PAID)      refunded = sum(converted REFUNDED)
//   netPaid  = max(paid - refunded, 0)
//   balance  = max(total - netPaid, 0)  overpaid = max(netPaid - total, 0)
// A payment with no converted amount (a legacy cross-currency row awaiting a
// human decision) contributes nothing and is counted in `unreconciled`.
export function summarizeOrderPayments(order, payments) {
  let paid = ZERO;
  let refunded = ZERO;
  let unreconciled = 0;

  for (const payment of payments) {
    if (payment.status !== "PAID" && payment.status !== "REFUNDED") continue;
    if (payment.convertedAmount === null || payment.convertedAmount === undefined) {
      unreconciled += 1;
      continue;
    }
    if (payment.status === "PAID") paid = paid.plus(payment.convertedAmount);
    else refunded = refunded.plus(payment.convertedAmount);
  }

  const total = dec(order.totalAmount);
  const net = Decimal.max(paid.minus(refunded), ZERO);
  const balance = Decimal.max(total.minus(net), ZERO);
  const overpaid = Decimal.max(net.minus(total), ZERO);

  let paymentStatus = "UNPAID";
  if (net.greaterThanOrEqualTo(total)) paymentStatus = "PAID";
  else if (net.greaterThan(0)) paymentStatus = "PARTIAL";

  return {
    currency: order.currency,
    totalAmount: round2(total),
    paidAmount: round2(net),
    refundedAmount: round2(refunded),
    balanceDue: round2(balance),
    overpaidAmount: round2(overpaid),
    unreconciledPayments: unreconciled,
    paymentStatus,
  };
}
