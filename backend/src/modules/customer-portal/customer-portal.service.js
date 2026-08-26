import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { getSystemActorId } from "../../utils/systemActor.js";
import { createOrder } from "../orders/orders.service.js";
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
  const [orders, documents] = await Promise.all([
    prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: ORDER_LIST_SELECT,
    }),
    prisma.document.count({ where: { customerId } }),
  ]);

  const activeOrders = orders.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status));
  const missingDocumentOrders = orders.filter(
    (order) => ACTIVE_ORDER_STATUSES.includes(order.status) && order.items.length > 0
  );

  const availableCoupons = await countAvailableCoupons(customerId);

  return {
    activeOrdersCount: activeOrders.length,
    recentOrders: orders.slice(0, 5),
    documentsCount: documents,
    ordersNeedingAttention: missingDocumentOrders.length,
    availableCouponsCount: availableCoupons,
  };
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
    return { order };
  } catch (error) {
    if (error.statusCode === 400) return { error: "COUPON_ERROR", message: error.message };
    throw error;
  }
}

export { COUPON_ERROR_MESSAGES };
