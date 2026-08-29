import prisma from "../../config/database.js";

// Never labeled "profit" unless every order item counted actually has a
// supplierCost on record — see finalizeOrderMetrics()'s grossProfit/note.
// That's the one hard rule this module exists to enforce; everything else
// here is just aggregation.

function num(decimal) {
  return Number(decimal || 0);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

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
      payments: { select: { status: true, amount: true } },
      assignedUser: { select: { id: true, fullName: true } },
    },
  });
}

function emptyOrderMetrics() {
  return { ordersCount: 0, revenue: 0, paid: 0, outstanding: 0, refunds: 0, itemsTotal: 0, itemsWithCost: 0, supplierCost: 0 };
}

function accumulateOrder(metrics, order) {
  metrics.ordersCount += 1;
  metrics.revenue += num(order.totalAmount);

  const paid = order.payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + num(p.amount), 0);
  const refunded = order.payments.filter((p) => p.status === "REFUNDED").reduce((sum, p) => sum + num(p.amount), 0);
  metrics.paid += paid;
  metrics.refunds += refunded;
  metrics.outstanding += Math.max(num(order.totalAmount) - paid, 0);

  for (const item of order.items) {
    metrics.itemsTotal += 1;
    if (item.supplierCost != null) {
      metrics.itemsWithCost += 1;
      metrics.supplierCost += num(item.supplierCost);
    }
  }
}

// The only place "profit" is ever computed or the word used — every caller
// goes through this so the "only if every item has a cost" rule can't be
// bypassed by a shortcut elsewhere.
function finalizeOrderMetrics(metrics) {
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
    ordersCount: metrics.ordersCount,
    revenue: round2(metrics.revenue),
    paid: round2(metrics.paid),
    outstanding: round2(metrics.outstanding),
    refunds: round2(metrics.refunds),
    supplierCost: metrics.itemsWithCost > 0 ? round2(metrics.supplierCost) : null,
    grossProfit: grossProfitAvailable ? round2(metrics.revenue - metrics.supplierCost) : null,
    costCoverage: Number(coverage.toFixed(2)),
    note,
  };
}

function emptyItemMetrics() {
  return { itemsTotal: 0, itemsWithCost: 0, revenue: 0, supplierCost: 0 };
}

function accumulateItem(metrics, item) {
  metrics.itemsTotal += 1;
  metrics.revenue += num(item.total);
  if (item.supplierCost != null) {
    metrics.itemsWithCost += 1;
    metrics.supplierCost += num(item.supplierCost);
  }
}

function finalizeItemMetrics(metrics) {
  const grossProfitAvailable = metrics.itemsTotal > 0 && metrics.itemsWithCost === metrics.itemsTotal;
  return {
    itemsTotal: metrics.itemsTotal,
    revenue: round2(metrics.revenue),
    supplierCost: metrics.itemsWithCost > 0 ? round2(metrics.supplierCost) : null,
    grossProfit: grossProfitAvailable ? round2(metrics.revenue - metrics.supplierCost) : null,
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

export async function getFinancialReport({ period, from, to, groupBy, organizationId }) {
  const range = resolveRange({ period, from, to });
  const orders = await fetchOrdersInRange({ ...range, organizationId });

  const totals = emptyOrderMetrics();
  for (const order of orders) accumulateOrder(totals, order);

  const report = {
    period: { from: range.from, to: range.to, label: range.label },
    totals: finalizeOrderMetrics(totals),
    breakdown: null,
  };

  if (groupBy && (ORDER_LEVEL_GROUPS.has(groupBy) || ITEM_LEVEL_GROUPS.has(groupBy))) {
    const groups = new Map();

    if (ORDER_LEVEL_GROUPS.has(groupBy)) {
      for (const order of orders) {
        const { key, label } = orderGroupKey(groupBy, order);
        if (!groups.has(key)) groups.set(key, { key, label, metrics: emptyOrderMetrics() });
        accumulateOrder(groups.get(key).metrics, order);
      }
      report.breakdown = {
        groupBy,
        rows: [...groups.values()]
          .map((g) => ({ key: g.key, label: g.label, ...finalizeOrderMetrics(g.metrics) }))
          .sort((a, b) => b.revenue - a.revenue),
      };
    } else {
      for (const order of orders) {
        for (const item of order.items) {
          const { key, label } = itemGroupKey(groupBy, item);
          if (!groups.has(key)) groups.set(key, { key, label, metrics: emptyItemMetrics() });
          accumulateItem(groups.get(key).metrics, item);
        }
      }
      report.breakdown = {
        groupBy,
        rows: [...groups.values()]
          .map((g) => ({ key: g.key, label: g.label, ...finalizeItemMetrics(g.metrics) }))
          .sort((a, b) => b.revenue - a.revenue),
      };
    }
  }

  return report;
}
