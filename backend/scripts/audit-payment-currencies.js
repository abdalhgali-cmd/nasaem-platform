// READ-ONLY audit of payments whose currency differs from their order's
// currency and that therefore have no FX snapshot (Payment.convertedAmount IS
// NULL). Before the currency-safe payment model these rows were summed at face
// value into the order's paid total, so affected orders may currently show a
// wrong paymentStatus. This script changes nothing; it prints what a human must
// review (and, for each, the conversion that would apply at a rate they choose).
//
//   DATABASE_URL=... node scripts/audit-payment-currencies.js [--json]
//
// Output contains ids, currencies and amounts only — no customer data.
import "dotenv/config";
import prisma from "../src/config/database.js";

const asJson = process.argv.includes("--json");

const rows = await prisma.$queryRaw`
  SELECT p."id" AS "paymentId", p."orderId", o."orderNumber", p."status",
         p."amount", p."currency" AS "paymentCurrency",
         o."totalAmount", o."currency" AS "orderCurrency", o."paymentStatus" AS "orderPaymentStatus",
         p."createdAt"
  FROM "Payment" p
  JOIN "Order" o ON o."id" = p."orderId"
  WHERE p."currency" <> o."currency" AND p."convertedAmount" IS NULL
  ORDER BY p."createdAt"`;

const orders = new Set(rows.map((row) => row.orderId));
const summary = {
  unreconciledPayments: rows.length,
  affectedOrders: orders.size,
  byPair: Object.entries(
    rows.reduce((acc, row) => {
      const key = `${row.paymentCurrency}->${row.orderCurrency}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  ).map(([pair, count]) => ({ pair, count })),
};

if (asJson) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log("Mixed-currency payments without an FX snapshot");
  console.log(`  payments: ${summary.unreconciledPayments}   orders affected: ${summary.affectedOrders}`);
  for (const { pair, count } of summary.byPair) console.log(`  ${pair}: ${count}`);
  for (const row of rows) {
    console.log(`  - ${row.orderNumber}  payment ${row.paymentId}  ${row.status}  ${row.amount} ${row.paymentCurrency}  (order total ${row.totalAmount} ${row.orderCurrency}, stored paymentStatus ${row.orderPaymentStatus})`);
  }
  if (!rows.length) console.log("  none — nothing to review.");
  console.log("\nRead-only: no data was modified.");
}

await prisma.$disconnect();
