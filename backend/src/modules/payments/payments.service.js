import { Prisma } from "@prisma/client";
import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeUserSelect } from "../../utils/safeSelects.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

const paymentInclude = {
  order: { include: { customer: true } },
  reviewedBy: { select: safeUserSelect },
};

// IMPORTANT: `db` must be the transaction client (`tx`) passed down from
// createPayment's `prisma.$transaction(...)` callback, not the module-level
// `prisma` client. The plain client runs its own queries outside the open
// transaction, so it can't see writes the transaction hasn't committed yet
// (e.g. the payment just created) and silently recalculates against stale
// data — which is what was happening before this fix.
//
// Only PAID payments count toward the total. A payment awaiting review
// (status stays UNPAID with reviewStatus PENDING until confirmed — see
// confirmPayment/rejectPayment below) must never inflate the order's paid
// total before staff have actually confirmed it.
async function recalculateOrderPaymentStatus(db, orderId) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { totalAmount: true },
  });

  const payments = await db.payment.findMany({
    where: { orderId, status: "PAID" },
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

export async function listPayments({ page, limit, skip, status, reviewStatus, orderId }) {
  const where = {
    ...(status ? { status } : {}),
    ...(reviewStatus ? { reviewStatus } : {}),
    ...(orderId ? { orderId } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: paymentInclude,
    }),
    prisma.payment.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getPaymentById(id) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      order: {
        include: { customer: true, items: { include: { service: true } } },
      },
      reviewedBy: { select: safeUserSelect },
    },
  });
}

// pendingReview: true records the payment as awaiting staff confirmation
// (status UNPAID, reviewStatus PENDING) instead of immediately counting it
// as PAID. Used when a customer/staff logs a bank transfer or receipt that
// still needs to be verified before it can move the order's balance. The
// default (no pendingReview) keeps the pre-existing behavior — staff
// recording a payment they have already verified in person/at the counter.
export async function createPayment(data) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: data.orderId },
      select: { id: true, totalAmount: true },
    });

    if (!order) {
      return null;
    }

    const pendingReview = Boolean(data.pendingReview);
    const payment = await tx.payment.create({
      data: {
        orderId: data.orderId,
        amount: toDecimal(data.amount),
        currency: data.currency || "SAR",
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber || null,
        status: pendingReview ? "UNPAID" : data.status || "PAID",
        reviewStatus: pendingReview ? "PENDING" : null,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      },
    });

    await recalculateOrderPaymentStatus(tx, data.orderId);

    // Re-fetch with the order relation now that the transaction has applied
    // the recalculated paymentStatus, so the response reflects reality.
    return tx.payment.findUnique({
      where: { id: payment.id },
      include: paymentInclude,
    });
  });
}

// Confirming moves the payment to PAID (so it now counts toward the order's
// paid total) and stamps who reviewed it. Only a payment still PENDING
// review can be confirmed — a payment recorded directly (reviewStatus null)
// was never submitted for review and has nothing to confirm; an already
// decided one (CONFIRMED/REJECTED) must not be silently re-decided, which is
// exactly the "confirming in a way that produces incorrect financial data"
// the review workflow exists to prevent.
export async function confirmPayment(id, reviewedByUserId) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) return null;
    if (payment.reviewStatus !== "PENDING") {
      const error = new Error("Only a payment awaiting review can be confirmed");
      error.statusCode = 409;
      throw error;
    }

    await tx.payment.update({
      where: { id },
      data: { status: "PAID", reviewStatus: "CONFIRMED", reviewedByUserId, reviewedAt: new Date() },
    });
    await recalculateOrderPaymentStatus(tx, payment.orderId);

    return tx.payment.findUnique({ where: { id }, include: paymentInclude });
  });
}

export async function rejectPayment(id, reviewedByUserId, reason) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) return null;
    if (payment.reviewStatus !== "PENDING") {
      const error = new Error("Only a payment awaiting review can be rejected");
      error.statusCode = 409;
      throw error;
    }

    await tx.payment.update({
      where: { id },
      data: { status: "UNPAID", reviewStatus: "REJECTED", rejectionReason: reason, reviewedByUserId, reviewedAt: new Date() },
    });
    // A rejected payment never counted toward the total (it stayed UNPAID),
    // so the order's paymentStatus does not change — no recalculation needed.

    return tx.payment.findUnique({ where: { id }, include: paymentInclude });
  });
}
