import prisma from "../../config/database.js";

// Same exclusion as payments.service.js's recalculateOrderPaymentStatus:
// UNPAID and REFUNDED payments never represent money actually collected.
const COLLECTED_PAYMENT_STATUS = { notIn: ["REFUNDED", "UNPAID"] };

export async function getDashboardStats() {
  const [customers, orders, payments, offers, documents, users] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.offer.count(),
    prisma.document.count(),
    prisma.user.count(),
  ]);

  const latestOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { customer: true },
  });

  // Revenue/outstanding are plain sums with no cross-currency conversion
  // (like the rest of this app, which doesn't handle mixed-currency
  // orders anywhere else either) — accurate as long as orders stay SAR,
  // the practical default today.
  const [revenueAgg, activeOrders, paidByOrder] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: COLLECTED_PAYMENT_STATUS },
    }),
    prisma.order.findMany({
      where: { status: { notIn: ["CANCELLED", "REJECTED"] } },
      select: { id: true, totalAmount: true },
    }),
    prisma.payment.groupBy({
      by: ["orderId"],
      _sum: { amount: true },
      where: { status: COLLECTED_PAYMENT_STATUS },
    }),
  ]);

  const paidByOrderId = Object.fromEntries(
    paidByOrder.map((row) => [row.orderId, Number(row._sum.amount || 0)])
  );

  const outstandingBalance = activeOrders.reduce((sum, order) => {
    const remaining = Number(order.totalAmount) - (paidByOrderId[order.id] || 0);
    return sum + Math.max(0, remaining);
  }, 0);

  return {
    customers,
    orders,
    payments,
    offers,
    documents,
    users,
    latestOrders,
    totalRevenue: Number(revenueAgg._sum.amount || 0),
    outstandingBalance,
  };
}
