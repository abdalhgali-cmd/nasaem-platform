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

function contactNextAction(request) {
  if (request.status === "CLOSED") return { key: "DONE", label: "مكتمل" };
  if (request.paymentStatus === "UNDER_REVIEW") return { key: "CONFIRM_PAYMENT", label: "مراجعة الدفع" };
  if (request.paymentStatus === "AWAITING_TRANSFER") return { key: "FOLLOW_PAYMENT", label: "متابعة الدفع" };
  if (!request.invoice && request.offers.length === 0) return { key: "QUOTE", label: "إضافة سعر" };
  if (request.invoice?.status === "PENDING" && request.documents.some((doc) => doc.status === "PENDING")) {
    return { key: "DOCUMENTS_OR_QUOTE", label: "مراجعة المستندات" };
  }
  if (request.invoice?.status === "PENDING" || request.offers.length > 0) return { key: "CUSTOMER_DECISION", label: "بانتظار العميل" };
  if (request.paymentStatus === "CONFIRMED" && request.deliverables.length === 0) return { key: "DELIVER", label: "إصدار وتسليم" };
  return { key: "PROCESS", label: "معالجة الطلب" };
}

function orderNextAction(order) {
  if (["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status)) return { key: "DONE", label: "مغلق" };
  if (order.paymentStatus === "UNPAID") return { key: "PAYMENT", label: "متابعة الدفع" };
  if (order.status === "NEW") return { key: "REVIEW", label: "بدء المعالجة" };
  if (order.status === "WAITING_DOCUMENTS") return { key: "DOCUMENTS", label: "طلب المستندات" };
  if (order.status === "PROCESSING") return { key: "ISSUE", label: "إكمال التنفيذ" };
  if (order.status === "APPROVED") return { key: "CLOSE", label: "إغلاق الطلب" };
  return { key: "REVIEW", label: "مراجعة الطلب" };
}

export async function getOperationsCenter() {
  const [contactRequests, orders, pendingPayments, unassignedOrders, waitingDocs] = await Promise.all([
    prisma.contactRequest.findMany({
      where: { status: { not: "CLOSED" } },
      orderBy: { updatedAt: "asc" },
      take: 50,
      include: {
        invoice: { select: { status: true, amount: true, currency: true } },
        offers: { select: { id: true, carrier: true, amount: true, currency: true } },
        documents: { select: { id: true, label: true, status: true } },
        deliverables: { select: { id: true }, take: 1 },
      },
    }),
    prisma.order.findMany({
      where: { status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } },
      orderBy: { updatedAt: "asc" },
      take: 50,
      include: {
        customer: { select: { fullName: true, phone: true, passportNo: true } },
        assignedUser: { select: { id: true, fullName: true } },
      },
    }),
    prisma.contactRequest.count({ where: { paymentStatus: "UNDER_REVIEW" } }),
    prisma.order.count({ where: { assignedUserId: null, status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } } }),
    prisma.order.count({ where: { status: "WAITING_DOCUMENTS" } }),
  ]);

  const queues = {
    newRequests: contactRequests.filter((r) => r.status === "NEW").length,
    waitingPaymentReview: pendingPayments,
    unassignedOrders,
    waitingDocuments: waitingDocs,
    waitingCustomer: contactRequests.filter((r) => contactNextAction(r).key === "CUSTOMER_DECISION").length,
    readyToDeliver: contactRequests.filter((r) => contactNextAction(r).key === "DELIVER").length,
  };

  const items = [
    ...contactRequests.map((request) => ({
      source: "contact_request",
      id: request.id,
      reference: request.id,
      customerName: request.name,
      phone: request.phone,
      service: request.service || "استفسار",
      status: request.status,
      paymentStatus: request.paymentStatus,
      amount: request.invoice?.amount ?? null,
      currency: request.invoice?.currency ?? null,
      updatedAt: request.updatedAt,
      nextAction: contactNextAction(request),
    })),
    ...orders.map((order) => ({
      source: "order",
      id: order.id,
      reference: order.orderNumber,
      customerName: order.customer?.fullName || "بدون اسم",
      phone: order.customer?.phone || "",
      service: order.items?.[0]?.service?.name || "طلب",
      status: order.status,
      paymentStatus: order.paymentStatus,
      amount: order.totalAmount,
      currency: order.currency,
      updatedAt: order.updatedAt,
      assignedUser: order.assignedUser?.fullName || null,
      nextAction: orderNextAction(order),
    })),
  ].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  return { queues, items: items.slice(0, 80) };
}
