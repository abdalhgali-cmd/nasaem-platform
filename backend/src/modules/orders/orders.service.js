import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import { nextSequence } from "../../utils/sequence.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

// Allowed forward/back transitions between order statuses. COMPLETED,
// REJECTED and CANCELLED are terminal — no further transitions from them.
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

export function isValidOrderStatusTransition(fromStatus, toStatus) {
  return (ORDER_STATUS_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const nextNumber = await nextSequence(`order-${year}`);
  return `NH-${year}-${String(nextNumber).padStart(6, "0")}`;
}

// The list view intentionally omits items/payments/history (available on
// getOrderById) to avoid pulling deeply nested relations for every row on
// every page load.
export async function listOrders({ page, limit, skip, status }) {
  const where = status ? { status } : undefined;

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        customer: true,
        assignedUser: { select: safeUserSelect },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getOrderById(id) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      assignedUser: { select: safeUserSelect },
      items: {
        include: { service: true },
      },
      documents: true,
      payments: true,
      notes: true,
      history: true,
      notifications: true,
      branch: true,
    },
  });
}

export async function createOrder(data, actorUserId = null) {
  const orderNumber = await generateOrderNumber();
  const creatorUserId = actorUserId || data.assignedUserId;

  if (!creatorUserId) {
    throw new Error("A valid user is required to create an order history entry");
  }

  const items = data.items.map((item) => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = toDecimal(item.unitPrice);
    const discount = toDecimal(item.discount || 0);
    const total = unitPrice.mul(quantity).minus(discount);

    return {
      serviceId: item.serviceId,
      quantity,
      unitPrice,
      discount,
      total,
    };
  });

  const totalAmount = items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0));

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
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
        items: {
          create: items,
        },
        history: {
          create: {
            oldStatus: "NEW",
            newStatus: "NEW",
            changedByUserId: creatorUserId,
            notes: "تم إنشاء الطلب",
          },
        },
      },
      include: {
        customer: true,
        assignedUser: { select: safeUserSelect },
        items: {
          include: { service: true },
        },
        history: true,
      },
    });

    return order;
  });
}

export async function assignOrder(orderId, assignedUserId) {
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });

  if (!existing) {
    return null;
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { assignedUserId },
    include: {
      customer: true,
      assignedUser: { select: safeUserSelect },
      items: { include: { service: true } },
      history: true,
    },
  });
}

export async function updateOrderStatus(orderId, status, changedByUserId, notes = null) {
  if (!changedByUserId) {
    throw new Error("A valid user is required to update order status");
  }

  return prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!currentOrder) {
      return null;
    }

    if (!isValidOrderStatusTransition(currentOrder.status, status)) {
      const error = new Error(
        `Cannot change order status from ${currentOrder.status} to ${status}`
      );
      error.statusCode = 409;
      throw error;
    }

    return tx.order.update({
      where: { id: orderId },
      data: {
        status,
        history: {
          create: {
            oldStatus: currentOrder.status,
            newStatus: status,
            changedByUserId,
            notes,
          },
        },
      },
      include: {
        customer: true,
        assignedUser: { select: safeUserSelect },
        items: {
          include: { service: true },
        },
        history: true,
      },
    });
  });
}
