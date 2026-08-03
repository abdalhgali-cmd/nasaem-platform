import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

async function recalculateOrderPaymentStatus(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { totalAmount: true },
  });

  const payments = await prisma.payment.findMany({
    where: { orderId },
    select: { amount: true, status: true },
  });

  const totalPaid = payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));

  let paymentStatus = "UNPAID";
  if (totalPaid.greaterThanOrEqualTo(order?.totalAmount ?? new Prisma.Decimal(0))) {
    paymentStatus = "PAID";
  } else if (totalPaid.greaterThan(0)) {
    paymentStatus = "PARTIAL";
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
  });

  return paymentStatus;
}

export async function listPayments() {
  return prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        include: { customer: true },
      },
    },
  });
}

export async function getPaymentById(id) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      order: {
        include: { customer: true, items: { include: { service: true } } },
      },
    },
  });
}

export async function createPayment(data) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: data.orderId },
      select: { id: true, totalAmount: true },
    });

    if (!order) {
      return null;
    }

    const payment = await tx.payment.create({
      data: {
        orderId: data.orderId,
        amount: toDecimal(data.amount),
        currency: data.currency || "SAR",
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber || null,
        status: data.status || "PAID",
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      },
      include: {
        order: {
          include: { customer: true },
        },
      },
    });

    await recalculateOrderPaymentStatus(data.orderId);

    return payment;
  });
}
