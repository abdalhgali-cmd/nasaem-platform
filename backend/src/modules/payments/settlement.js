import prismaPackage from "@prisma/client";

const { Prisma } = prismaPackage;
const ZERO = new Prisma.Decimal(0);

// Money is stored as Decimal(12,2). Amounts are accepted with at most two
// decimal places and never rounded silently.
export function toMoney(value) {
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite() || decimal.decimalPlaces() > 2) {
    const error = new Error("المبلغ يجب أن يكون رقمًا بخانتين عشريتين على الأكثر");
    error.statusCode = 400;
    error.code = "INVALID_AMOUNT";
    throw error;
  }
  return decimal;
}

function sum(rows) {
  return rows.reduce((total, row) => total.plus(row.amount), ZERO);
}

// The single definition of an order's financial position. Used by the
// payment write path (to set Order.paymentStatus and to refuse over-payment
// and over-refund), by the order detail API, and by the reports, so the UI
// and the reports cannot disagree.
//
// - Only rows in the ORDER'S currency count. There is no approved
//   conversion workflow for payments, so new mismatched payments are
//   refused; mismatched legacy rows are reported separately (never summed).
// - confirmedPaid: PAYMENT rows with status PAID (confirmed money in).
// - refunded: REFUND rows with status PAID, plus legacy rows recorded as
//   status REFUNDED before refunds were their own kind.
// - pending: PAYMENT rows awaiting review. Never counted as received.
// - legacy PAYMENT rows with status PARTIAL were never counted (their meaning
//   is ambiguous) and stay excluded; diagnostics list them.
export function computeSettlement(order, payments) {
  const currency = order.currency;
  const total = new Prisma.Decimal(order.totalAmount ?? 0);
  const sameCurrency = payments.filter((p) => p.currency === currency);
  const foreign = payments.filter((p) => p.currency !== currency && p.status !== "UNPAID");

  const confirmedPaid = sum(sameCurrency.filter((p) => (p.kind ?? "PAYMENT") === "PAYMENT" && p.status === "PAID"));
  const refunded = sum(
    sameCurrency.filter(
      (p) => ((p.kind ?? "PAYMENT") === "REFUND" && p.status === "PAID") || ((p.kind ?? "PAYMENT") === "PAYMENT" && p.status === "REFUNDED")
    )
  );
  const pending = sum(sameCurrency.filter((p) => (p.kind ?? "PAYMENT") === "PAYMENT" && p.reviewStatus === "PENDING"));
  const netPaid = confirmedPaid.minus(refunded);
  const outstanding = Prisma.Decimal.max(total.minus(netPaid), ZERO);

  let status = "UNPAID";
  if (refunded.greaterThan(0) && netPaid.lessThanOrEqualTo(0)) status = "REFUNDED";
  else if (netPaid.greaterThanOrEqualTo(total) && (netPaid.greaterThan(0) || total.isZero())) status = "PAID";
  else if (netPaid.greaterThan(0)) status = "PARTIAL";

  return {
    currency,
    total: total.toFixed(2),
    confirmedPaid: confirmedPaid.toFixed(2),
    refunded: refunded.toFixed(2),
    netPaid: netPaid.toFixed(2),
    outstanding: outstanding.toFixed(2),
    pending: pending.toFixed(2),
    status,
    excludedForeignCurrency: foreign.map((p) => ({ id: p.id, amount: new Prisma.Decimal(p.amount).toFixed(2), currency: p.currency, status: p.status })),
  };
}

// Remaining refundable amount of one confirmed payment.
export function refundableAmount(payment, refundsOfPayment) {
  const alreadyRefunded = sum(refundsOfPayment.filter((r) => r.status === "PAID"));
  return Prisma.Decimal.max(new Prisma.Decimal(payment.amount).minus(alreadyRefunded), ZERO);
}
