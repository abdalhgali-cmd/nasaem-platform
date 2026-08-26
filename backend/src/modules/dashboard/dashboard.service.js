import prisma from "../../config/database.js";
import { safeCustomerSelect } from "../../utils/safeSelects.js";

export async function getDashboardStats() {
  const [customers, orders, payments, offers, documents, users] = await Promise.all([
    prisma.customer.count(), prisma.order.count(), prisma.payment.count(), prisma.offer.count(), prisma.document.count(), prisma.user.count(),
  ]);
  const [salesByCurrency, paidByCurrency, serviceSales, latestOrders] = await Promise.all([
    prisma.order.groupBy({ by: ["currency"], _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["currency", "status"], where: { status: { not: "REFUNDED" } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.orderItem.groupBy({ by: ["serviceId"], _sum: { total: true }, _count: { _all: true } }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { customer: { select: safeCustomerSelect } } }),
  ]);
  const serviceIds = serviceSales.map((row) => row.serviceId);
  const services = serviceIds.length ? await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, code: true, name: true, category: true } }) : [];
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  return { customers, orders, payments, offers, documents, users, financial: { salesByCurrency, paidByCurrency, serviceSales: serviceSales.map((row) => ({ ...row, service: serviceMap.get(row.serviceId) || null })) }, latestOrders };
}

function contactNextAction(request) {
  if (request.status === "CLOSED") return { key: "DONE", label: "مكتمل" };
  if (request.paymentStatus === "UNDER_REVIEW") return { key: "CONFIRM_PAYMENT", label: "مراجعة الدفع" };
  if (request.paymentStatus === "AWAITING_TRANSFER") return { key: "FOLLOW_PAYMENT", label: "متابعة الدفع" };
  if (!request.invoice && request.offers.length === 0) return { key: "QUOTE", label: "إضافة سعر" };
  if (request.invoice?.status === "PENDING" && request.documents.some((doc) => doc.status === "PENDING")) return { key: "DOCUMENTS_OR_QUOTE", label: "مراجعة المستندات" };
  if (request.invoice?.status === "PENDING" || request.offers.length > 0) return { key: "CUSTOMER_DECISION", label: "بانتظار العميل" };
  if (request.paymentStatus === "CONFIRMED" && request.deliverables.length === 0) return { key: "DELIVER", label: "إصدار وتسليم" };
  return { key: "PROCESS", label: "معالجة الطلب" };
}

function orderNextAction(order) {
  if (["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status)) return { key: "DONE", label: "مغلق" };
  if (order.payments?.length > 0) return { key: "CONFIRM_PAYMENT", label: "مراجعة الدفع" };
  if (order.paymentStatus === "UNPAID") return { key: "PAYMENT", label: "متابعة الدفع" };
  if (order.status === "NEW") return { key: "REVIEW", label: "بدء المعالجة" };
  if (order.status === "WAITING_DOCUMENTS") return { key: "DOCUMENTS", label: "طلب المستندات" };
  if (order.status === "PROCESSING") return { key: "ISSUE", label: "إكمال التنفيذ" };
  if (order.status === "APPROVED") return { key: "CLOSE", label: "إغلاق الطلب" };
  return { key: "REVIEW", label: "مراجعة الطلب" };
}

export async function getOperationsCenter() {
  const [contactRequests, orders, pendingContactPayments, pendingOrderPayments, unassignedOrders, waitingDocs] = await Promise.all([
    prisma.contactRequest.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { updatedAt: "asc" }, take: 50, include: { invoice: { select: { status: true, amount: true, currency: true } }, offers: { select: { id: true, carrier: true, amount: true, currency: true } }, documents: { select: { id: true, label: true, status: true } }, deliverables: { select: { id: true }, take: 1 } } }),
    prisma.order.findMany({ where: { status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } }, orderBy: { updatedAt: "asc" }, take: 50, include: { customer: { select: { fullName: true, phone: true, passportNo: true } }, assignedUser: { select: { id: true, fullName: true } }, items: { include: { service: { select: { id: true, name: true } } }, take: 1 }, payments: { where: { reviewStatus: "PENDING" }, select: { id: true, amount: true, currency: true } } } }),
    prisma.contactRequest.count({ where: { paymentStatus: "UNDER_REVIEW" } }),
    prisma.payment.count({ where: { reviewStatus: "PENDING" } }),
    prisma.order.count({ where: { assignedUserId: null, status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } } }),
    prisma.order.count({ where: { status: "WAITING_DOCUMENTS" } }),
  ]);

  const now = Date.now();
  const stalledHours = 24;
  const contactItems = contactRequests.map((request) => ({ source: "contact_request", id: request.id, reference: request.id, customerName: request.name, phone: request.phone, service: request.service || "استفسار", status: request.status, paymentStatus: request.paymentStatus, amount: request.invoice?.amount ?? null, currency: request.invoice?.currency ?? null, updatedAt: request.updatedAt, ageHours: Math.floor((now - new Date(request.updatedAt).getTime()) / 3600000), nextAction: contactNextAction(request), hasPaymentUnderReview: request.paymentStatus === "UNDER_REVIEW" }));
  const orderItems = orders.map((order) => ({ source: "order", id: order.id, reference: order.orderNumber, customerName: order.customer?.fullName || "بدون اسم", phone: order.customer?.phone || "", passportNo: order.customer?.passportNo || "", service: order.items?.[0]?.service?.name || "طلب", serviceId: order.items?.[0]?.service?.id || null, status: order.status, paymentStatus: order.paymentStatus, amount: order.totalAmount, currency: order.currency, updatedAt: order.updatedAt, assignedUser: order.assignedUser?.fullName || null, assignedUserId: order.assignedUserId || null, ageHours: Math.floor((now - new Date(order.updatedAt).getTime()) / 3600000), nextAction: orderNextAction(order), hasPaymentUnderReview: order.payments.length > 0, pendingPayment: order.payments[0] ? { id: order.payments[0].id, amount: order.payments[0].amount, currency: order.payments[0].currency } : null }));
  const items = [...contactItems, ...orderItems].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  const stalled = items.filter((item) => item.ageHours >= stalledHours).length;
  return { queues: { newRequests: contactRequests.filter((r) => r.status === "NEW").length, waitingPaymentReview: pendingContactPayments + pendingOrderPayments, unassignedOrders, waitingDocuments: waitingDocs, waitingCustomer: contactRequests.filter((r) => contactNextAction(r).key === "CUSTOMER_DECISION").length, readyToDeliver: contactRequests.filter((r) => contactNextAction(r).key === "DELIVER").length, stalled }, items: items.slice(0, 80) };
}

export async function getDashboardSummary() {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [todayOrders, weekOrders, monthOrders, todayPayments, weekPayments, monthPayments, openRequests] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: startToday } } }),
    prisma.order.count({ where: { createdAt: { gte: startWeek } } }),
    prisma.order.count({ where: { createdAt: { gte: startMonth } } }),
        // Only PAID counts as actually collected — a payment awaiting
        // review (status stays UNPAID until confirmed, see
        // payments.service.js) must not inflate "paid" before staff have
        // actually confirmed it, same fix as recalculateOrderPaymentStatus.
        prisma.payment.aggregate({ where: { createdAt: { gte: startToday }, status: "PAID" }, _sum: { amount: true } }),
        prisma.payment.aggregate({ where: { createdAt: { gte: startWeek }, status: "PAID" }, _sum: { amount: true } }),
        prisma.payment.aggregate({ where: { createdAt: { gte: startMonth }, status: "PAID" }, _sum: { amount: true } }),
    prisma.contactRequest.count({ where: { status: { not: "CLOSED" } } }),
  ]);
  return { periods: { today: { orders: todayOrders, paid: todayPayments._sum.amount || 0 }, last7Days: { orders: weekOrders, paid: weekPayments._sum.amount || 0 }, month: { orders: monthOrders, paid: monthPayments._sum.amount || 0 } }, openContactRequests: openRequests, profit: null, profitNote: "لا يتم احتساب الربح حتى تتوفر تكلفة المورد الفعلية للطلب." };
}
