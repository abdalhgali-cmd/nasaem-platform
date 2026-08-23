import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import { nextSequence } from "../../utils/sequence.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";

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

export async function listOrders({ page, limit, skip, status, paymentStatus, assignedUserId, serviceId, search, stalledHours }) {
  const where = {
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
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { customer: true, assignedUser: { select: safeUserSelect }, items: { include: { service: true } } } }),
    prisma.order.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function assignOrder(orderId, assignedUserId, changedByUserId) {
  if (!changedByUserId) throw new Error("A valid user is required to assign an order");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { assignedUserId: assignedUserId || null },
    include: { customer: true, assignedUser: { select: safeUserSelect }, items: { include: { service: true } } },
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
export async function setItemSupplierCost(orderId, itemId, data) {
  const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
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

export async function getOrderById(id) {
  return prisma.order.findUnique({ where: { id }, include: { customer: true, assignedUser: { select: safeUserSelect }, items: { include: { service: true } }, documents: true, payments: true, notes: true, history: true, notifications: true, branch: true } });
}

export async function createOrder(data, actorUserId = null) {
  const orderNumber = await generateOrderNumber();
  const creatorUserId = actorUserId || data.assignedUserId;
  if (!creatorUserId) throw new Error("A valid user is required to create an order history entry");

  const items = data.items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = toDecimal(item.unitPrice);
    const discount = toDecimal(item.discount || 0);
    return { serviceId: item.serviceId, quantity, unitPrice, discount, total: unitPrice.mul(quantity).minus(discount) };
  });
  const totalAmount = items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));

  return prisma.$transaction(async (tx) => tx.order.create({
    data: {
      orderNumber,
      customerId: data.customerId,
      assignedUserId: data.assignedUserId || null,
      branchId: data.branchId || null,
      status: "NEW",
      paymentStatus: "UNPAID",
      priority: data.priority || "NORMAL",
      totalAmount,
      currency: data.currency || "SAR",
      items: { create: items },
      history: { create: { oldStatus: "NEW", newStatus: "NEW", changedByUserId: creatorUserId, notes: "تم إنشاء الطلب" } },
    },
    include: { customer: true, assignedUser: { select: safeUserSelect }, items: { include: { service: true } }, history: true },
  }));
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
  const admins = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
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

export async function updateOrderStatus(orderId, status, changedByUserId, notes = null) {
  if (!changedByUserId) throw new Error("A valid user is required to update order status");

  const updatedOrder = await prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
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
      include: { customer: true, assignedUser: { select: safeUserSelect }, items: { include: { service: true } }, history: true },
    });
  });

  if (!updatedOrder) return null;
  const previousStatus = updatedOrder.history.length > 0 ? updatedOrder.history[updatedOrder.history.length - 1]?.oldStatus : null;
  if (previousStatus) await notifyOrderStatusChange(updatedOrder, previousStatus, updatedOrder.status);
  return updatedOrder;
}
