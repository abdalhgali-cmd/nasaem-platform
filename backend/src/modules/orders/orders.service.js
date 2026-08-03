import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

async function generateOrderNumber() {
  const count = await prisma.order.count();
  const nextNumber = count + 1;
  const year = new Date().getFullYear();
  return `NH-${year}-${String(nextNumber).padStart(6, "0")}`;
}

export async function listOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      assignedUser: true,
      items: {
        include: { service: true },
      },
      payments: true,
      history: true,
    },
  });
}

export async function getOrderById(id) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      assignedUser: true,
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
            changedByUserId: actorUserId || data.assignedUserId || data.customerId,
            notes: "Order created",
          },
        },
      },
      include: {
        customer: true,
        assignedUser: true,
        items: {
          include: { service: true },
        },
        history: true,
      },
    });

    return order;
  });
}

export async function updateOrderStatus(orderId, status, changedByUserId, notes = null) {
  return prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!currentOrder) {
      return null;
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
        assignedUser: true,
        items: {
          include: { service: true },
        },
        history: true,
      },
    });
  });
}
