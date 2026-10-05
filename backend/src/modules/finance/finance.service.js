import prisma from "../../config/database.js";
import { Decimal, ZERO, dec, money, summarizeOrderPayments } from "../../utils/money.js";

// Never labeled "profit" unless every order item counted actually has a
// supplierCost on record — see finalizeOrderMetrics()'s grossProfit/note.
// That's the one hard rule this module exists to enforce; everything else
// here is just aggregation.
//
// Currency rule (docs/FINANCIAL_MODEL.md): amounts in different currencies are
// NEVER added together. Every figure is reported per ORDER currency, using
// Decimal arithmetic; payments count at their stored conversion into the order's
// currency, net of refunds. `paid` is therefore net collected.

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function resolveRange({ period, from, to }) {
  if (from || to) {
    return { from: from ? new Date(from) : null, to: to ? new Date(to) : null, label: "custom" };
  }

  const now = new Date();
  if (period === "day") {
    return { from: startOfDay(now), to: null, label: "day" };
  }
  if (period === "week") {
    const start = startOfDay(now);
    start.setDate(start.getDate() - 6);
    return { from: start, to: null, label: "week" };
  }
  // "month" is also the default when no period/from/to is given.
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null, label: "month" };
}

async function fetchOrdersInRange({ from, to, organizationId }) {
  return prisma.order.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    },
    include: {
      items: { include: { service: { select: { id: true, name: true, category: true } }, supplier: { select: { id: true, name: true } } } },
      payments: { select: { status: true, amount: true, currency: true, convertedAmount: true } },
      assignedUser: { select: { id: true, fullName: true } },
    },
  });
}

function emptyOrderMetrics() {
  return { ordersCount: 0, revenue: ZERO, paid: ZERO, refunds: ZERO, outstanding: ZERO, itemsTotal: 0, itemsWithCost: 0, supplierCost: ZERO, unreconciledPayments: 0 };
}

function accumulateOrder(metrics, order) {
  metrics.ordersCount += 1;
  metrics.revenue = metrics.revenue.plus(order.totalAmount);

  const summary = summarizeOrderPayments(order, order.payments);
  metrics.paid = metrics.paid.plus(summary.paidAmount);
  metrics.refunds = metrics.refunds.plus(summary.refundedAmount);
  metrics.outstanding = metrics.outstanding.plus(summary.balanceDue);
  metrics.unreconciledPayments += summary.unreconciledPayments;

  // supplierCost has no currency of its own; it is recorded against an order
  // item and is read in that order's currency.
  for (const item of order.items) {
    metrics.itemsTotal += 1;
    if (item.supplierCost != null) {
      metrics.itemsWithCost += 1;
      metrics.supplierCost = metrics.supplierCost.plus(item.supplierCost);
    }
  }
}

// The only place "profit" is ever computed or the word used — every caller
// goes through this so the "only if every item has a cost" rule can't be
// bypassed by a shortcut elsewhere.
function finalizeOrderMetrics(currency, metrics) {
  const grossProfitAvailable = metrics.itemsTotal > 0 && metrics.itemsWithCost === metrics.itemsTotal;
  const coverage = metrics.itemsTotal > 0 ? metrics.itemsWithCost / metrics.itemsTotal : 0;

  let note = null;
  if (!grossProfitAvailable) {
    note =
      metrics.itemsWithCost === 0
        ? "Gross margin unavailable — no supplier cost recorded yet for these order items. Showing Revenue only."
        : `Gross margin unavailable — supplier cost recorded for ${metrics.itemsWithCost} of ${metrics.itemsTotal} order items. Showing Revenue only.`;
  }

  return {
    currency,
    ordersCount: metrics.ordersCount,
    revenue: money(metrics.revenue),
    paid: money(metrics.paid),
    outstanding: money(metrics.outstanding),
    refunds: money(metrics.refunds),
    unreconciledPayments: metrics.unreconciledPayments,
    supplierCost: metrics.itemsWithCost > 0 ? money(metrics.supplierCost) : null,
    grossProfit: grossProfitAvailable ? money(metrics.revenue.minus(metrics.supplierCost)) : null,
    costCoverage: Number(coverage.toFixed(2)),
    note,
  };
}

function emptyItemMetrics() {
  return { itemsTotal: 0, itemsWithCost: 0, revenue: ZERO, supplierCost: ZERO };
}

function accumulateItem(metrics, item) {
  metrics.itemsTotal += 1;
  metrics.revenue = metrics.revenue.plus(item.total);
  if (item.supplierCost != null) {
    metrics.itemsWithCost += 1;
    metrics.supplierCost = metrics.supplierCost.plus(item.supplierCost);
  }
}

function finalizeItemMetrics(currency, metrics) {
  const grossProfitAvailable = metrics.itemsTotal > 0 && metrics.itemsWithCost === metrics.itemsTotal;
  return {
    currency,
    itemsTotal: metrics.itemsTotal,
    revenue: money(metrics.revenue),
    supplierCost: metrics.itemsWithCost > 0 ? money(metrics.supplierCost) : null,
    grossProfit: grossProfitAvailable ? money(metrics.revenue.minus(metrics.supplierCost)) : null,
    costCoverage: metrics.itemsTotal > 0 ? Number((metrics.itemsWithCost / metrics.itemsTotal).toFixed(2)) : 0,
  };
}

// "employee" and "currency" are order-level attributes, so those groupings
// use the full order metrics (revenue/paid/outstanding/refunds — a payment
// can't be attributed to one item when an order has several). "service" and
// "supplier" are per-item attributes (one order can mix services/suppliers
// across its items), so those groupings report revenue/cost/margin per item
// — the financially meaningful unit for "how does this service/supplier
// perform", without inventing a per-item share of a whole-order payment.
const ORDER_LEVEL_GROUPS = new Set(["employee", "currency"]);
const ITEM_LEVEL_GROUPS = new Set(["service", "supplier"]);

function orderGroupKey(groupBy, order) {
  if (groupBy === "employee") {
    return { key: order.assignedUserId || "UNASSIGNED", label: order.assignedUser?.fullName || "غير مسند" };
  }
  return { key: order.currency, label: order.currency };
}

function itemGroupKey(groupBy, item) {
  if (groupBy === "service") {
    return { key: item.service.category, label: item.service.category };
  }
  return { key: item.supplierId || "UNKNOWN", label: item.supplier?.name || "بدون مورّد محدد" };
}

// Every accumulation is keyed by (group, currency) so currencies never mix.
function bucket(map, key, label, currency, create) {
  const composite = `${key}\u0000${currency}`;
  if (!map.has(composite)) map.set(composite, { key, label, currency, metrics: create() });
  return map.get(composite).metrics;
}

const byRevenueDesc = (a, b) => dec(b.revenue).comparedTo(dec(a.revenue));

export async function getFinancialReport({ period, from, to, groupBy, organizationId }) {
  const range = resolveRange({ period, from, to });
  const orders = await fetchOrdersInRange({ ...range, organizationId });

  const totals = new Map();
  for (const order of orders) accumulateOrder(bucket(totals, "ALL", "ALL", order.currency, emptyOrderMetrics), order);

  const report = {
    period: { from: range.from, to: range.to, label: range.label },
    // One entry per order currency; there is deliberately no cross-currency grand total.
    totalsByCurrency: [...totals.values()].map((g) => finalizeOrderMetrics(g.currency, g.metrics)).sort(byRevenueDesc),
    breakdown: null,
  };

  if (groupBy && (ORDER_LEVEL_GROUPS.has(groupBy) || ITEM_LEVEL_GROUPS.has(groupBy))) {
    const groups = new Map();

    if (ORDER_LEVEL_GROUPS.has(groupBy)) {
      for (const order of orders) {
        const { key, label } = orderGroupKey(groupBy, order);
        accumulateOrder(bucket(groups, key, label, order.currency, emptyOrderMetrics), order);
      }
      report.breakdown = {
        groupBy,
        rows: [...groups.values()].map((g) => ({ key: g.key, label: g.label, ...finalizeOrderMetrics(g.currency, g.metrics) })).sort(byRevenueDesc),
      };
    } else {
      for (const order of orders) {
        for (const item of order.items) {
          const { key, label } = itemGroupKey(groupBy, item);
          accumulateItem(bucket(groups, key, label, order.currency, emptyItemMetrics), item);
        }
      }
      report.breakdown = {
        groupBy,
        rows: [...groups.values()].map((g) => ({ key: g.key, label: g.label, ...finalizeItemMetrics(g.currency, g.metrics) })).sort(byRevenueDesc),
      };
    }
  }

  return report;
}
