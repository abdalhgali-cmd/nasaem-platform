// Read-only financial diagnostics. Never writes. Prints ids and amounts only
// (no customer names, phones or documents) so the output can be shared with
// the accountant who reviews it.
//
//   DATABASE_URL=... node src/scripts/financial-diagnostics.js [--organization <id>]
//
// Reports:
// - payments whose currency differs from their order's currency (these are
//   excluded from every balance now; before they were added as if equal)
// - legacy payment rows labelled PARTIAL (never counted) or REFUNDED
//   (treated as refunds)
// - orders whose stored paymentStatus differs from the settlement computed
//   by payments/settlement.js (they will change the next time a payment on
//   that order is recorded)
// - orders where confirmed net paid exceeds the total
// - possible duplicates: same order, amount, currency and method recorded
//   within 5 minutes, without an idempotency key
import "dotenv/config";
import prisma from "../config/database.js";
import { computeSettlement } from "../modules/payments/settlement.js";

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export async function runFinancialDiagnostics({ organizationId } = {}) {
  const orders = await prisma.order.findMany({
    where: organizationId ? { organizationId } : {},
    select: {
      id: true,
      orderNumber: true,
      organizationId: true,
      totalAmount: true,
      currency: true,
      paymentStatus: true,
      payments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, currency: true, status: true, kind: true, reviewStatus: true, paymentMethod: true, idempotencyKey: true, createdAt: true },
      },
    },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    ordersScanned: orders.length,
    currencyMismatches: [],
    legacyPartialRows: [],
    legacyRefundedRows: [],
    statusDrift: [],
    overpaidOrders: [],
    possibleDuplicates: [],
  };

  for (const order of orders) {
    const settlement = computeSettlement(order, order.payments);
    for (const p of order.payments) {
      const row = { orderId: order.id, orderNumber: order.orderNumber, paymentId: p.id, amount: p.amount.toFixed(2), currency: p.currency };
      if (p.currency !== order.currency) report.currencyMismatches.push({ ...row, orderCurrency: order.currency, status: p.status });
      if (p.kind === "PAYMENT" && p.status === "PARTIAL") report.legacyPartialRows.push(row);
      if (p.kind === "PAYMENT" && p.status === "REFUNDED") report.legacyRefundedRows.push(row);
    }
    if (settlement.status !== order.paymentStatus) {
      report.statusDrift.push({ orderId: order.id, orderNumber: order.orderNumber, stored: order.paymentStatus, computed: settlement.status, netPaid: settlement.netPaid, total: settlement.total, currency: order.currency });
    }
    if (Number(settlement.netPaid) > Number(settlement.total)) {
      report.overpaidOrders.push({ orderId: order.id, orderNumber: order.orderNumber, netPaid: settlement.netPaid, total: settlement.total, currency: order.currency });
    }
    const confirmed = order.payments.filter((p) => p.kind === "PAYMENT" && p.status === "PAID" && !p.idempotencyKey);
    for (let i = 1; i < confirmed.length; i += 1) {
      const [a, b] = [confirmed[i - 1], confirmed[i]];
      if (a.amount.equals(b.amount) && a.currency === b.currency && a.paymentMethod === b.paymentMethod && b.createdAt - a.createdAt <= DUPLICATE_WINDOW_MS) {
        report.possibleDuplicates.push({ orderId: order.id, orderNumber: order.orderNumber, paymentIds: [a.id, b.id], amount: a.amount.toFixed(2), currency: a.currency, secondsApart: Math.round((b.createdAt - a.createdAt) / 1000) });
      }
    }
  }

  report.summary = Object.fromEntries(
    Object.entries(report).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])
  );
  return report;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly) {
  const index = process.argv.indexOf("--organization");
  const organizationId = index > -1 ? process.argv[index + 1] : undefined;
  runFinancialDiagnostics({ organizationId })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error("Diagnostics failed:", error.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
