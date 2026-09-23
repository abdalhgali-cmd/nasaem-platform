import prismaPackage from "@prisma/client";

const { Prisma } = prismaPackage;
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeUserSelect } from "../../utils/safeSelects.js";

// Every customer-facing failure reason Phase 5/7 requires, each mapped to
// an Arabic message that never leaks internal detail (no stack traces, no
// "which specific rule" beyond what a legitimate customer needs to fix
// their attempt). NOT_FOUND is deliberately reused for "coupon restricted
// to a different customer" — telling an unauthorized caller "this coupon
// exists but isn't for you" would leak the coupon's existence.
export const COUPON_ERROR_MESSAGES = {
  NOT_FOUND: "الكوبون غير موجود",
  INACTIVE: "الكوبون غير فعال",
  NOT_STARTED: "لم يبدأ الكوبون بعد",
  EXPIRED: "الكوبون منتهي",
  USAGE_LIMIT_REACHED: "لقد تم استخدام هذا الكوبون بالكامل",
  ALREADY_USED: "لقد استخدمت هذا الكوبون مسبقاً",
  MIN_ORDER_NOT_MET: "الحد الأدنى للطلب غير متحقق",
  SERVICE_NOT_ELIGIBLE: "الكوبون غير متاح لهذه الخدمة",
  VISA_TYPE_NOT_ELIGIBLE: "الكوبون غير متاح لهذه الفئة من التأشيرات",
  NOT_NEW_CUSTOMER: "هذا الكوبون مخصص للعملاء الجدد فقط",
};

const ADMIN_COUPON_INCLUDE = {
  service: { select: { id: true, name: true, code: true } },
  visaType: { select: { id: true, name: true, country: true } },
  restrictedTo: { select: { id: true, fullName: true, customerNo: true, phone: true } },
  createdBy: { select: safeUserSelect },
  _count: { select: { usages: true } },
};

function toDecimalOrNull(value) {
  return value === null || value === undefined ? null : new Prisma.Decimal(Number(value).toFixed(2));
}

export async function listCoupons({ page, limit, skip, active, archived, search }) {
  const where = {
    ...(active !== undefined ? { active } : {}),
    ...(archived !== undefined ? { archived } : { archived: false }),
    ...(search ? { code: { contains: search, mode: "insensitive" } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: ADMIN_COUPON_INCLUDE }),
    prisma.coupon.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getCouponById(id) {
  return prisma.coupon.findUnique({ where: { id }, include: ADMIN_COUPON_INCLUDE });
}

export async function listCouponUsages(couponId, { page, limit, skip }) {
  const where = { couponId };
  const [data, total] = await Promise.all([
    prisma.couponUsage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        customer: { select: { id: true, fullName: true, customerNo: true, phone: true } },
        order: { select: { id: true, orderNumber: true, totalAmount: true, currency: true, status: true } },
      },
    }),
    prisma.couponUsage.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function createCoupon(data, createdByUserId) {
  const existing = await prisma.coupon.findUnique({ where: { code: data.code } });
  if (existing) return { error: "CODE_TAKEN" };

  const coupon = await prisma.coupon.create({
    data: {
      code: data.code,
      description: data.description || null,
      discountType: data.discountType,
      discountValue: toDecimalOrNull(data.discountValue),
      startDate: data.startDate || null,
      expiryDate: data.expiryDate || null,
      active: data.active ?? true,
      usageLimit: data.usageLimit ?? null,
      usageLimitPerCustomer: data.usageLimitPerCustomer ?? 1,
      minOrderAmount: toDecimalOrNull(data.minOrderAmount),
      serviceId: data.serviceId || null,
      visaTypeId: data.visaTypeId || null,
      newCustomersOnly: data.newCustomersOnly ?? false,
      customerId: data.customerId || null,
      createdByUserId,
    },
    include: ADMIN_COUPON_INCLUDE,
  });
  return { coupon };
}

export async function updateCoupon(id, data) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.coupon.update({
    where: { id },
    data: {
      ...("description" in data ? { description: data.description || null } : {}),
      ...("discountType" in data ? { discountType: data.discountType } : {}),
      ...("discountValue" in data ? { discountValue: toDecimalOrNull(data.discountValue) } : {}),
      ...("startDate" in data ? { startDate: data.startDate || null } : {}),
      ...("expiryDate" in data ? { expiryDate: data.expiryDate || null } : {}),
      ...("active" in data ? { active: data.active } : {}),
      ...("usageLimit" in data ? { usageLimit: data.usageLimit ?? null } : {}),
      ...("usageLimitPerCustomer" in data ? { usageLimitPerCustomer: data.usageLimitPerCustomer ?? null } : {}),
      ...("minOrderAmount" in data ? { minOrderAmount: toDecimalOrNull(data.minOrderAmount) } : {}),
      ...("serviceId" in data ? { serviceId: data.serviceId || null } : {}),
      ...("visaTypeId" in data ? { visaTypeId: data.visaTypeId || null } : {}),
      ...("newCustomersOnly" in data ? { newCustomersOnly: data.newCustomersOnly } : {}),
      ...("customerId" in data ? { customerId: data.customerId || null } : {}),
    },
    include: ADMIN_COUPON_INCLUDE,
  });
}

export async function setCouponStatus(id, { active, archived }) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.coupon.update({
    where: { id },
    data: { ...(active !== undefined ? { active } : {}), ...(archived !== undefined ? { archived } : {}) },
    include: ADMIN_COUPON_INCLUDE,
  });
}

export function calculateDiscount(coupon, orderAmount) {
  const amount = Number(orderAmount);
  const value = Number(coupon.discountValue);
  const rawDiscount = coupon.discountType === "PERCENTAGE" ? amount * (value / 100) : value;
  // Never let a discount exceed the order total — protects against a
  // negative final amount from a large FIXED coupon on a small order.
  const discountAmount = Math.min(Math.max(rawDiscount, 0), amount);
  return {
    discountAmount: Number(discountAmount.toFixed(2)),
    finalAmount: Number((amount - discountAmount).toFixed(2)),
  };
}

// The single source of truth for "is this coupon usable, right now, by
// this customer, for this purchase" — called both by the customer-facing
// preview endpoint (coupons.controller.js's validate) and, inside a DB
// transaction with a row lock, by orders.service.js at the moment an order
// is actually placed. Passing a `tx` (a Prisma transaction client) makes
// every read here part of that same transaction; the caller is
// responsible for the row lock itself (see applyCouponToOrder below) since
// only it knows the transaction boundary.
export async function validateCouponForCustomer(
  { code, customerId, serviceId, visaTypeId, orderAmount, excludeOrderId },
  client = prisma
) {
  const coupon = await client.coupon.findUnique({ where: { code: code.toUpperCase() } });

  if (!coupon || coupon.archived) return { valid: false, error: "NOT_FOUND" };
  if (coupon.customerId && coupon.customerId !== customerId) return { valid: false, error: "NOT_FOUND" };
  if (!coupon.active) return { valid: false, error: "INACTIVE" };

  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) return { valid: false, error: "NOT_STARTED" };
  if (coupon.expiryDate && now > coupon.expiryDate) return { valid: false, error: "EXPIRED" };

  if (coupon.usageLimit !== null) {
    const totalUsage = await client.couponUsage.count({ where: { couponId: coupon.id } });
    if (totalUsage >= coupon.usageLimit) return { valid: false, error: "USAGE_LIMIT_REACHED" };
  }

  if (coupon.usageLimitPerCustomer !== null) {
    const customerUsage = await client.couponUsage.count({ where: { couponId: coupon.id, customerId } });
    if (customerUsage >= coupon.usageLimitPerCustomer) return { valid: false, error: "ALREADY_USED" };
  }

  const amount = Number(orderAmount || 0);
  if (coupon.minOrderAmount !== null && amount < Number(coupon.minOrderAmount)) {
    return { valid: false, error: "MIN_ORDER_NOT_MET" };
  }

  if (coupon.serviceId && coupon.serviceId !== serviceId) return { valid: false, error: "SERVICE_NOT_ELIGIBLE" };
  if (coupon.visaTypeId && coupon.visaTypeId !== visaTypeId) return { valid: false, error: "VISA_TYPE_NOT_ELIGIBLE" };

  if (coupon.newCustomersOnly) {
    // excludeOrderId matters because applyCouponToOrder validates from
    // *inside* the same transaction that already created this order's row
    // (required so CouponUsage.orderId has something to point at — see
    // that function's own comment) — without excluding it, a customer's
    // very first order would count itself as a "prior order" and always
    // fail this check.
    const priorOrders = await client.order.count({
      where: { customerId, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
    });
    if (priorOrders > 0) return { valid: false, error: "NOT_NEW_CUSTOMER" };
  }

  const { discountAmount, finalAmount } = calculateDiscount(coupon, amount);
  return { valid: true, coupon, originalAmount: amount, discountAmount, finalAmount };
}

// Applies a coupon to an order that is being created *right now*, inside
// the caller's transaction (see orders.service.js's createOrder). Locks
// the Coupon row for the duration of the transaction (SELECT ... FOR
// UPDATE) so two concurrent orders racing against the same near-exhausted
// usageLimit can't both pass validateCouponForCustomer's count check
// before either has written its CouponUsage row — the second request
// blocks until the first's transaction commits (or rolls back), then
// re-reads a usage count that already reflects it. The @@unique on
// CouponUsage.orderId (schema.prisma) independently guarantees a single
// order can never carry two coupon redemptions.
export async function applyCouponToOrder(tx, { code, customerId, orderId, serviceId, visaTypeId, orderAmount }) {
  const codeUpper = code.toUpperCase();
  const lockedCoupon = await tx.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${codeUpper} FOR UPDATE`;
  if (!lockedCoupon.length) return { valid: false, error: "NOT_FOUND" };

  const result = await validateCouponForCustomer(
    { code: codeUpper, customerId, serviceId, visaTypeId, orderAmount, excludeOrderId: orderId },
    tx
  );
  if (!result.valid) return result;

  await tx.couponUsage.create({
    data: {
      couponId: result.coupon.id,
      customerId,
      orderId,
      discountAmount: toDecimalOrNull(result.discountAmount),
    },
  });

  return result;
}
