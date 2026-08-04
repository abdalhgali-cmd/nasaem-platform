import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

// IMPORTANT: `db` must be the transaction client (`tx`) passed down from
// createPayment's `prisma.$transaction(...)` callback, not the module-level
// `prisma` client. The plain client runs its own queries outside the open
// transaction, so it can't see writes the transaction hasn't committed yet
// (e.g. the payment just created) and silently recalculates against stale
// data — which is what was happening before this fix.
async function recalculateOrderPaymentStatus(db, orderId) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { totalAmount: true },
  });

  const payments = await db.payment.findMany({
    where: { orderId, status: { not: "REFUNDED" } },
    select: { amount: true, status: true },
  });

  const totalPaid = payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));

  let paymentStatus = "UNPAID";
  if (totalPaid.greaterThanOrEqualTo(order?.totalAmount ?? new Prisma.Decimal(0))) {
    paymentStatus = "PAID";
  } else if (totalPaid.greaterThan(0)) {
    paymentStatus = "PARTIAL";
  }

  await db.order.update({
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
    });

    await recalculateOrderPaymentStatus(tx, data.orderId);

    // Re-fetch with the order relation now that the transaction has applied
    // the recalculated paymentStatus, so the response reflects reality.
    return tx.payment.findUnique({
      where: { id: payment.id },
      include: {
        order: {
          include: { customer: true },
        },
      },
    });
  });
}
