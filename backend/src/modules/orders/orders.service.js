import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import { nextSequence } from "../../utils/sequence.js";
import { safeUserSelect, safeCustomerSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { applyCouponToOrder, COUPON_ERROR_MESSAGES } from "../coupons/coupons.service.js";

const ORDER_INCLUDE = { customer: { select: safeCustomerSelect }, assignedUser: { select: safeUserSelect }, items: { include: { service: true } }, history: true };

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

const ORDER_STATUS_TRANSITIONS = {
  NEW: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["WAITING_DOCUMENTS", "PAYMENT_PENDING", "REJECTED", "CANCELLED"],
  WAITING_DOCUMENTS: ["UNDER_REVIEW", "PAYMENT_PENDING", "REJECTED", "CANCELLED"],
  PAYMENT_PENDING: ["PROCESSING", "REJECTED", "CANCELLED"],
  PROCESSING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

const ORDER_STATUS_LABELS = {
  NEW: "طلب جديد",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "جاري التنفيذ",
  APPROVED: "تمت الموافقة",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض",
  CANCELLED: "ملغي",
};

export function isValidOrderStatusTransition(fromStatus, toStatus) {
  return (ORDER_STATUS_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const nextNumber = await nextSequence(`order-${year}`);
  return `NH-${year}-${String(nextNumber).padStart(6, "0")}`;
}

export async function listOrders({ page, limit, skip, status, paymentStatus, assignedUserId, serviceId, search, stalledHours, organizationId }) {
  const where = {
    organizationId,
    ...(status ? { status } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(assignedUserId === "UNASSIGNED" ? { assignedUserId: null } : assignedUserId ? { assignedUserId } : {}),
    ...(serviceId ? { items: { some: { serviceId } } } : {}),
    ...(stalledHours ? { updatedAt: { lte: new Date(Date.now() - stalledHours * 3600000) } } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: "insensitive" } },
            { customer: { fullName: { contains: search, mode: "insensitive" } } },
            { customer: { phone: { contains: search, mode: "insensitive" } } },
            { customer: { passportNo: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [data, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { customer: { select: safeCustomerSelect }, assignedUser: { select: safeUserSelect }, items: { include: { service: true } } } }),
    prisma.order.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function assignOrder(orderId, assignedUserId, changedByUserId, organizationId) {
  if (!changedByUserId) throw new Error("A valid user is required to assign an order");

  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId } });
  if (!order) return null;

  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedUserId, organizationId, status: "ACTIVE" }, select: { id: true } });
    if (!assignee) return null;
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { assignedUserId: assignedUserId || null },
    include: { customer: { select: safeCustomerSelect }, assignedUser: { select: safeUserSelect }, items: { include: { service: true } } },
  });

  if (updated.assignedUserId && updated.assignedUserId !== changedByUserId) {
    await createNotification({
      title: "طلب مُسند إليك",
      message: `تم إسناد الطلب ${updated.orderNumber} إليك`,
      type: "ORDER_ASSIGNED",
      userId: updated.assignedUserId,
      orderId: updated.id,
    });
  }

  return updated;
}

// Supplier cost is deliberately a separate, later action from order
// creation (see orders.validators.js) — the invoice from the supplier
// often arrives after the sale. Restricted at the route layer to
// SUPER_ADMIN/ADMIN/ACCOUNTANT since it's financial data feeding gross
// profit reporting (finance.service.js), not general order handling.
export async function setItemSupplierCost(orderId, itemId, data, organizationId) {
  const item = await prisma.orderItem.findFirst({ where: { id: itemId, order: { id: orderId, organizationId } } });
  if (!item || item.orderId !== orderId) return null;

  return prisma.orderItem.update({
    where: { id: itemId },
    data: {
      supplierId: "supplierId" in data ? data.supplierId || null : undefined,
      supplierCost: "supplierCost" in data ? (data.supplierCost ?? null) : undefined,
    },
    include: { service: true, supplier: true },
  });
}

export async function getOrderById(id, organizationId) {
  return prisma.order.findFirst({ where: { id, organizationId }, include: { customer: { select: safeCustomerSelect }, assignedUser: { select: safeUserSelect }, items: { include: { service: true } }, documents: true, payments: true, notes: true, history: true, notifications: true, branch: true } });
}

// Coupon application (Phase 6 of the customer-accounts/coupons plan). A
// coupon can only ever change what's charged for a NEW order at the
// moment it's created — never retroactively, and never editable
// afterwards through this or any other function — so "apply a coupon to
// an existing order" deliberately doesn't exist as an operation. Runs
// inside the same transaction as the order row itself: creates the order
// at its pre-discount total first (so CouponUsage.orderId — required,
// unique — has a real order to point at), then, only if the coupon is
// still valid under a row lock (see applyCouponToOrder), updates that
// same order to the discounted total and stamps the coupon snapshot
// fields. Any failure (invalid/expired/exhausted coupon) throws, which
// rolls back the whole transaction — the order is never left half-created
// with a coupon that didn't actually apply.
async function createOrderWithOptionalCoupon(tx, { orderData, couponCode, customerId, serviceId, visaTypeId, originalAmount, creatorUserId }) {
  const order = await tx.order.create({
    data: { ...orderData, history: { create: { oldStatus: "NEW", newStatus: "NEW", changedByUserId: creatorUserId, notes: "تم إنشاء الطلب" } } },
    include: ORDER_INCLUDE,
  });

  if (!couponCode) return order;

  const result = await applyCouponToOrder(tx, {
    code: couponCode,
    customerId,
    orderId: order.id,
    serviceId,
    visaTypeId,
    orderAmount: Number(originalAmount),
  });

  if (!result.valid) {
    const error = new Error(COUPON_ERROR_MESSAGES[result.error] || "تعذر تطبيق الكوبون");
    error.statusCode = 400;
    throw error;
  }

  return tx.order.update({
    where: { id: order.id },
    data: {
      couponId: result.coupon.id,
      couponCode: result.coupon.code,
      discountType: result.coupon.discountType,
      discountValue: result.coupon.discountValue,
      originalAmount: toDecimal(result.originalAmount),
      discountAmount: toDecimal(result.discountAmount),
      totalAmount: toDecimal(result.finalAmount),
    },
    include: ORDER_INCLUDE,
  });
}

export async function createOrder(data, actorUserId = null, expectedOrganizationId = null) {
  const orderNumber = await generateOrderNumber();
  const creatorUserId = actorUserId || data.assignedUserId;
  if (!creatorUserId) throw new Error("A valid user is required to create an order history entry");

  const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { organizationId: true } });
  if (!customer || (expectedOrganizationId && customer.organizationId !== expectedOrganizationId)) {
    const error = new Error("Customer not found");
    error.statusCode = 404;
    throw error;
  }

  const items = data.items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = toDecimal(item.unitPrice);
    const discount = toDecimal(item.discount || 0);
    return { serviceId: item.serviceId, quantity, unitPrice, discount, total: unitPrice.mul(quantity).minus(discount) };
  });
  const totalAmount = items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));

  return prisma.$transaction((tx) =>
    createOrderWithOptionalCoupon(tx, {
      orderData: {
        orderNumber,
        organizationId: customer.organizationId,
        customerId: data.customerId,
        assignedUserId: data.assignedUserId || null,
        branchId: data.branchId || null,
        status: "NEW",
        paymentStatus: "UNPAID",
        priority: data.priority || "NORMAL",
        totalAmount,
        currency: data.currency || "SAR",
        items: { create: items },
      },
      couponCode: data.couponCode || null,
      customerId: data.customerId,
      // Coupon eligibility is matched against the first line item's
      // service — the common case (a single-service order, which is the
      // only shape the customer self-checkout endpoint ever produces).
      // A staff-created multi-service order's coupon (if any) is matched
      // against its first item only; this is a disclosed, deliberate
      // simplification rather than modeling per-item coupon eligibility,
      // which nothing today needs.
      serviceId: items[0]?.serviceId || null,
      visaTypeId: data.visaTypeId || null,
      originalAmount: totalAmount,
      creatorUserId,
    })
  );
}

function customerStatusMessage(order, status) {
  const label = ORDER_STATUS_LABELS[status] || status;
  return `تحديث طلبك ${order.orderNumber}: ${label}.\nيمكنك متابعة التفاصيل من حسابك في نسائم الحرمين.`;
}

async function notifyOrderStatusChange(order, oldStatus, newStatus) {
  if (oldStatus === newStatus) return;
  const title = `تحديث الطلب ${order.orderNumber}`;
  const message = `تم تغيير حالة الطلب من ${ORDER_STATUS_LABELS[oldStatus] || oldStatus} إلى ${ORDER_STATUS_LABELS[newStatus] || newStatus}.`;
  if (order.assignedUser?.id) await createNotification({ title, message, type: "ORDER_STATUS", userId: order.assignedUser.id, orderId: order.id });
  const admins = await prisma.user.findMany({
    where: { organizationId: order.organizationId, role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });
  const uniqueRecipientIds = new Set(admins.map((admin) => admin.id));
  if (order.assignedUser?.id) uniqueRecipientIds.add(order.assignedUser.id);
  await Promise.all([...uniqueRecipientIds].filter((id) => id !== order.assignedUser?.id).map((userId) => createNotification({ title, message, type: "ORDER_STATUS", userId, orderId: order.id })));
  if (order.customer?.phone) sendWhatsAppMessage(order.customer.phone, customerStatusMessage(order, newStatus));
}

// Required document types per Service.category (the free-text category
// values seeded in prisma/seed.js — there is no separate requirements table
// in the schema, so this stays a code-level map rather than a migration).
// A category not listed here falls back to DEFAULT_REQUIRED_DOCUMENT_TYPES
// rather than blocking completion on a document type the service was never
// told it needs.
const SERVICE_DOCUMENT_REQUIREMENTS = {
  flight: ["PASSPORT"],
  hotel: ["PASSPORT"],
  umrah: ["PASSPORT", "PHOTO"],
  family_visit: ["PASSPORT", "PHOTO"],
  work_visa: ["PASSPORT", "PHOTO"],
  egypt_clearance: ["PASSPORT"],
  ferry: ["PASSPORT"],
  intl_visa: ["PASSPORT", "PHOTO"],
  tasheel: ["PASSPORT"],
  package: ["PASSPORT", "PHOTO"],
};
const DEFAULT_REQUIRED_DOCUMENT_TYPES = ["PASSPORT"];

// Union of the required document types across every service on the order —
// an order with a flight item and an umrah item needs whatever either one
// needs, not just one of them.
export function getRequiredDocumentTypes(order) {
  const categories = (order.items || []).map((item) => item.service?.category).filter(Boolean);
  if (categories.length === 0) return DEFAULT_REQUIRED_DOCUMENT_TYPES;
  const required = new Set();
  for (const category of categories) {
    for (const type of SERVICE_DOCUMENT_REQUIREMENTS[category] || DEFAULT_REQUIRED_DOCUMENT_TYPES) required.add(type);
  }
  return [...required];
}

function hasRequiredDocuments(order) {
  const required = getRequiredDocumentTypes(order);
  const uploadedTypes = new Set((order.documents || []).map((document) => document.type));
  return required.every((type) => uploadedTypes.has(type));
}

function hasConfirmedPayment(order) {
  return order.paymentStatus === "PAID";
}

export function canCompleteOrder(order) {
  return hasConfirmedPayment(order) && hasRequiredDocuments(order);
}

export async function updateOrderStatus(orderId, status, changedByUserId, notes = null, organizationId = null) {
  if (!changedByUserId) throw new Error("A valid user is required to update order status");

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findFirst({
      where: { id: orderId, ...(organizationId ? { organizationId } : {}) },
      include: {
        documents: { select: { type: true } },
        items: { include: { service: { select: { category: true } } } },
      },
    });
    if (!currentOrder) return null;
    if (!isValidOrderStatusTransition(currentOrder.status, status)) {
      const error = new Error(`Cannot change order status from ${currentOrder.status} to ${status}`);
      error.statusCode = 409;
      throw error;
    }
    if (status === "COMPLETED" && !canCompleteOrder(currentOrder)) {
      const error = new Error("لا يمكن إغلاق الطلب قبل تأكيد الدفع وإرفاق المستندات المطلوبة");
      error.statusCode = 409;
      throw error;
    }
    return tx.order.update({
      where: { id: orderId },
      data: { status, history: { create: { oldStatus: currentOrder.status, newStatus: status, changedByUserId, notes } } },
      include: { customer: { select: safeCustomerSelect }, assignedUser: { select: safeUserSelect }, items: { include: { service: true } }, history: true },
    });
  });

  if (!updatedOrder) return null;
  const previousStatus = updatedOrder.history.length > 0 ? updatedOrder.history[updatedOrder.history.length - 1]?.oldStatus : null;
  if (previousStatus) await notifyOrderStatusChange(updatedOrder, previousStatus, updatedOrder.status);
  return updatedOrder;
}
