import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { getSystemActorId } from "../../utils/systemActor.js";
import { createOrder } from "../orders/orders.service.js";
import { getContactRequestDeliverableFile } from "../contact-request-deliverables/contact-request-deliverables.service.js";
import { createNotification } from "../../utils/notifications.js";
import { createContactRequestDocument } from "../contact-request-documents/contact-request-documents.service.js";
import { COUPON_ERROR_MESSAGES } from "../coupons/coupons.service.js";

const ACTIVE_ORDER_STATUSES = ["NEW", "UNDER_REVIEW", "WAITING_DOCUMENTS", "PAYMENT_PENDING", "PROCESSING", "APPROVED"];

const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  paymentStatus: true,
  totalAmount: true,
  originalAmount: true,
  discountAmount: true,
  couponCode: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  items: { select: { id: true, quantity: true, unitPrice: true, total: true, service: { select: { id: true, name: true, category: true } } } },
};

// Every query in this module is scoped to `customerId` taken from the
// authenticated Customer session (req.customer.id, set by
// requireCustomerAuth) — never from a route param or request body — so a
// customer can never read another customer's orders/documents by guessing
// an id (IDOR/BOLA). getMyOrderById below is the one place an id *does*
// come from the URL, and it guards with `customerId` in the `where`
// itself rather than fetching by id and checking ownership after.

export async function getMyOverview(customerId) {
  const activeWhere = { customerId, status: { in: ACTIVE_ORDER_STATUSES } };
  const [recentOrders, activeOrdersCount, attentionOrdersCount, documents, activeRequestsCount, latestOrder, latestRequest] = await Promise.all([
    prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 5, select: ORDER_LIST_SELECT }),
    prisma.order.count({ where: activeWhere }),
    prisma.order.count({ where: { ...activeWhere, items: { some: {} } } }),
    prisma.document.count({ where: { customerId } }),
    prisma.contactRequest.count({ where: { customerId, status: { not: "CLOSED" } } }),
    prisma.order.findFirst({ where: { customerId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.contactRequest.findFirst({ where: { customerId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const availableCoupons = await countAvailableCoupons(customerId);
  const latestUpdateAt = [latestOrder?.updatedAt, latestRequest?.updatedAt].filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
  return { activeOrdersCount, recentOrders, documentsCount: documents, ordersNeedingAttention: attentionOrdersCount, activeRequestsCount, latestUpdateAt, availableCouponsCount: availableCoupons };
}

export async function listMyOrders(customerId, { page, limit, skip }) {
  const where = { customerId };
  const [data, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select: ORDER_LIST_SELECT }),
    prisma.order.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getMyOrderById(customerId, orderId) {
  // customerId is part of the WHERE, not a post-fetch check: a mismatched
  // id returns null exactly like a nonexistent one, so this endpoint can
  // never distinguish "not yours" from "doesn't exist" to the caller.
  return prisma.order.findFirst({
    where: { id: orderId, customerId },
    include: {
      items: { include: { service: true } },
      documents: true,
      payments: { select: { id: true, amount: true, currency: true, paymentMethod: true, status: true, paidAt: true, createdAt: true } },
      history: { orderBy: { changedAt: "desc" } },
    },
  });
}

export async function listMyDocuments(customerId) {
  return prisma.document.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, orderId: true, order: { select: { orderNumber: true } } },
  });
}

async function countAvailableCoupons(customerId) {
  const { available } = await listMyCoupons(customerId);
  return available.length;
}

// Not a security boundary (coupon codes still have to pass
// validateCouponForCustomer at redemption time), just a dashboard
// convenience: a coupon restricted to a different customer is excluded
// entirely rather than shown-then-rejected, so a customer only ever sees
// coupons that are actually theirs to try.
export async function listMyCoupons(customerId) {
  const now = new Date();
  const visibleWhere = { archived: false, OR: [{ customerId: null }, { customerId }] };

  const [candidates, usages, priorOrderCount] = await Promise.all([
    prisma.coupon.findMany({
      where: visibleWhere,
      include: { service: { select: { id: true, name: true } }, visaType: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.couponUsage.findMany({ where: { customerId }, select: { couponId: true } }),
    prisma.order.count({ where: { customerId } }),
  ]);

  const usedCouponIds = new Set(usages.map((usage) => usage.couponId));
  const usageCountByCoupon = new Map();
  for (const usage of usages) usageCountByCoupon.set(usage.couponId, (usageCountByCoupon.get(usage.couponId) || 0) + 1);

  const available = [];
  const used = [];
  const expired = [];

  for (const coupon of candidates) {
    const isExpired = coupon.expiryDate && coupon.expiryDate < now;
    const notStarted = coupon.startDate && coupon.startDate > now;
    const myUsageCount = usageCountByCoupon.get(coupon.id) || 0;
    const perCustomerExhausted = coupon.usageLimitPerCustomer !== null && myUsageCount >= coupon.usageLimitPerCustomer;
    const ineligibleNewCustomerOnly = coupon.newCustomersOnly && priorOrderCount > 0;

    const summary = {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      expiryDate: coupon.expiryDate,
      minOrderAmount: coupon.minOrderAmount ? Number(coupon.minOrderAmount) : null,
      service: coupon.service,
      visaType: coupon.visaType,
    };

    if (isExpired) {
      expired.push(summary);
    } else if (usedCouponIds.has(coupon.id) && perCustomerExhausted) {
      used.push(summary);
    } else if (coupon.active && !notStarted && !perCustomerExhausted && !ineligibleNewCustomerOnly) {
      available.push(summary);
    }
  }

  return { available, used, expired };
}

export async function createSelfOrder(customerId, { serviceId, visaTypeId, quantity, couponCode }) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) return { error: "SERVICE_NOT_FOUND" };

  let unitPrice = service.basePrice;
  let currency = service.currency;

  if (visaTypeId) {
    const visaType = await prisma.visaType.findUnique({ where: { id: visaTypeId } });
    if (!visaType || !visaType.active || visaType.serviceId !== serviceId) {
      return { error: "VISA_TYPE_NOT_FOUND" };
    }
    unitPrice = visaType.basePrice;
    currency = visaType.currency;
  }

  const actorUserId = await getSystemActorId();

  try {
    const order = await createOrder(
      {
        customerId,
        currency,
        items: [{ serviceId, quantity, unitPrice: Number(unitPrice), discount: 0 }],
        couponCode: couponCode || null,
        visaTypeId: visaTypeId || null,
      },
      actorUserId
    );
    await createNotification({
      customerId,
      title: "تم إنشاء طلبك",
      message: `تم إنشاء الطلب ${order.orderNumber} ويمكنك متابعة حالته من حسابك.`,
      type: "ORDER_CREATED",
      orderId: order.id,
    });
    return { order };
  } catch (error) {
    if (error.statusCode === 400) return { error: "COUPON_ERROR", message: error.message };
    throw error;
  }
}

export { COUPON_ERROR_MESSAGES };

const CUSTOMER_REQUEST_INCLUDE = {
  serviceRef: { select: { id: true, name: true, category: true } },
  visaType: { select: { id: true, name: true, country: true } },
  invoice: { select: { id: true, amount: true, currency: true, description: true, status: true, createdAt: true, decidedAt: true } },
  offers: { select: { id: true, carrier: true, description: true, amount: true, currency: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  documents: { select: { id: true, label: true, fileName: true, mimeType: true, sizeBytes: true, status: true, reviewNote: true, createdAt: true }, orderBy: { createdAt: "desc" } },
  deliverables: { select: { id: true, label: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" } },
};

function getRequestNextAction(request) {
  if (request.outcome === "COMPLETED") return "طلبك مكتمل ولا يوجد إجراء مطلوب منك حاليًا.";
  if (request.outcome === "REJECTED" || request.outcome === "CANCELLED") return "راجع الملاحظة الظاهرة وتواصل مع الدعم عند الحاجة.";
  if (request.documents.some((document) => document.status === "REJECTED")) return "راجع ملاحظة المستند المرفوض وأعد رفعه من صفحة الطلب.";
  if (request.paymentStatus === "UNDER_REVIEW") return "تم استلام إثبات التحويل، وسيراجعه فريقنا.";
  if (request.paymentStatus === "AWAITING_TRANSFER") return "أكمل التحويل وفق تعليمات الدفع الظاهرة في طلبك.";
  if (request.invoice?.status === "PENDING") return "راجع الفاتورة واتخذ الإجراء المطلوب.";
  if (request.offers.length > 0 && !request.selectedOfferId) return "راجع العروض المتاحة واختر العرض المناسب.";
  if (request.documents.some((document) => document.status === "PENDING")) return "انتظر مراجعة المستندات المرفوعة.";
  return "سنخبرك عند الحاجة إلى إجراء جديد.";
}

function toCustomerRequest(request) {
  return {
    id: request.id,
    requestNumber: request.id,
    service: request.serviceRef || (request.service ? { name: request.service, category: null } : null),
    visaType: request.visaType,
    status: request.status,
    outcome: request.outcome,
    paymentStatus: request.paymentStatus,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    latestUpdateAt: request.updatedAt,
    nextAction: getRequestNextAction(request),
    notes: request.outcomeNote || null,
    invoice: request.invoice,
    offers: request.offers,
    selectedOfferId: request.selectedOfferId,
    documents: request.documents,
    deliverables: request.deliverables,
  };
}

export async function listMyRequests(customerId, { page, limit, skip }) {
  const where = { customerId };
  const [requests, total] = await Promise.all([
    prisma.contactRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: CUSTOMER_REQUEST_INCLUDE }),
    prisma.contactRequest.count({ where }),
  ]);
  return { data: requests.map(toCustomerRequest), meta: buildPaginationMeta(page, limit, total) };
}

export async function getMyRequestById(customerId, requestId) {
  const request = await prisma.contactRequest.findFirst({ where: { id: requestId, customerId }, include: CUSTOMER_REQUEST_INCLUDE });
  if (!request) return null;
  const timeline = await prisma.activityLog.findMany({
    where: { entity: "ContactRequest", entityId: requestId },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true },
  });
  return { ...toCustomerRequest(request), timeline };
}

export async function uploadMyRequestDocument(customerId, requestId, { label, file, requirementId }) {
  const request = await prisma.contactRequest.findFirst({ where: { id: requestId, customerId }, select: { id: true } });
  if (!request) return { error: "NOT_FOUND" };
  return createContactRequestDocument(requestId, { label, file, requirementId });
}

export async function getMyRequestDeliverableFile(customerId, requestId, deliverableId) {
  const request = await prisma.contactRequest.findFirst({ where: { id: requestId, customerId }, select: { id: true } });
  if (!request) return null;
  return getContactRequestDeliverableFile(requestId, deliverableId);
}

export { getRequestNextAction };

export async function listMyNotifications(customerId, { page, limit, skip }) {
  const where = { customerId };
  const [data, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select: { id: true, title: true, message: true, type: true, orderId: true, readAt: true, createdAt: true } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { customerId, readAt: null } }),
  ]);
  return { data, meta: { ...buildPaginationMeta(page, limit, total), unreadCount } };
}

export async function markMyNotificationRead(customerId, notificationId) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, customerId }, select: { id: true } });
  if (!notification) return null;
  return prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() }, select: { id: true, title: true, message: true, type: true, orderId: true, readAt: true, createdAt: true } });
}
