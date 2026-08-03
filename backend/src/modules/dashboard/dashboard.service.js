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

  const latestOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { customer: true },
  });

  return {
    customers,
    orders,
    payments,
    offers,
    documents,
    users,
    latestOrders,
  };
}
