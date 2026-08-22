import prisma from "../../config/database.js";

export async function getDashboardStats() {
  const [customers, orders, payments, offers, documents, users] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.offer.count(),
    prisma.document.count(),
    prisma.user.count(),
  ]);

  const [salesByCurrency, paidByCurrency, serviceSales, latestOrders] = await Promise.all([
    prisma.order.groupBy({ by: ["currency"], _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({
      by: ["currency", "status"],
      where: { status: { not: "REFUNDED" } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({ by: ["serviceId"], _sum: { total: true }, _count: { _all: true } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: true },
    }),
  ]);

  const serviceIds = serviceSales.map((row) => row.serviceId);
  const services = serviceIds.length
    ? await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, code: true, name: true, category: true } })
    : [];
  const serviceMap = new Map(services.map((service) => [service.id, service]));

  return {
    customers,
    orders,
    payments,
    offers,
    documents,
    users,
    financial: {
      salesByCurrency,
      paidByCurrency,
      serviceSales: serviceSales.map((row) => ({
        ...row,
        service: serviceMap.get(row.serviceId) || null,
      })),
    },
    latestOrders,
  };
}
