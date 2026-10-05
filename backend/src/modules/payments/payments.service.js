import prismaPackage from "@prisma/client";

const { Prisma } = prismaPackage;
import prisma from "../../config/database.js";
import { Decimal, convertAmount, dec, summarizeOrderPayments } from "../../utils/money.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeUserSelect, safeCustomerSelect } from "../../utils/safeSelects.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

const paymentInclude = {
  order: { include: { customer: { select: safeCustomerSelect } } },
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
    select: { totalAmount: true, currency: true },
  });

  const payments = await db.payment.findMany({
    where: { orderId, status: { in: ["PAID", "REFUNDED"] } },
    select: { status: true, convertedAmount: true },
  });

  // Net of refunds, in the order's own currency (see utils/money.js and
  // docs/FINANCIAL_MODEL.md): foreign-currency payments count at their stored
  // conversion snapshot, never at face value.
  const { paymentStatus } = summarizeOrderPayments(order ?? { totalAmount: 0, currency: "SAR" }, payments);

  await db.order.update({
    where: { id: orderId },
    data: { paymentStatus },
  });

  return paymentStatus;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// Resolves the currency + FX snapshot for a payment recorded against `order`.
export function resolvePaymentConversion({ order, amount, currency, fxRate }) {
  const paymentCurrency = currency ?? order.currency;

  if (paymentCurrency === order.currency) {
    if (fxRate !== undefined && fxRate !== null && !dec(fxRate).equals(1)) {
      throw badRequest(`fxRate must be 1 (or omitted) when the payment is in the order currency (${order.currency})`);
    }
    return { currency: paymentCurrency, fxRate: new Decimal(1), convertedAmount: convertAmount(amount, 1) };
  }

  if (fxRate === undefined || fxRate === null) {
    throw badRequest(
      `This payment is in ${paymentCurrency} but the order is in ${order.currency}; supply fxRate (${order.currency} per 1 ${paymentCurrency}).`,
    );
  }
  return { currency: paymentCurrency, fxRate: dec(fxRate), convertedAmount: convertAmount(amount, fxRate) };
}

export async function listPayments({ page, limit, skip, status, reviewStatus, orderId, organizationId }) {
  const where = {
    ...(status ? { status } : {}),
    ...(reviewStatus ? { reviewStatus } : {}),
    ...(orderId ? { orderId } : {}),
    ...(organizationId ? { order: { organizationId } } : {}),
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

export async function getPaymentById(id, organizationId) {
  return prisma.payment.findFirst({
    where: { id, ...(organizationId ? { order: { organizationId } } : {}) },
    include: {
      order: {
        include: { customer: { select: safeCustomerSelect }, items: { include: { service: true } } },
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
export async function createPayment(data, organizationId) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: data.orderId, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, totalAmount: true, currency: true },
    });

    if (!order) {
      return null;
    }

    const conversion = resolvePaymentConversion({ order, amount: data.amount, currency: data.currency, fxRate: data.fxRate });

    const pendingReview = Boolean(data.pendingReview);
    const payment = await tx.payment.create({
      data: {
        orderId: data.orderId,
        amount: toDecimal(data.amount),
        currency: conversion.currency,
        fxRate: conversion.fxRate,
        convertedAmount: conversion.convertedAmount,
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
export async function confirmPayment(id, reviewedByUserId, organizationId) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id, ...(organizationId ? { order: { organizationId } } : {}) } });
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

export async function rejectPayment(id, reviewedByUserId, reason, organizationId) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id, ...(organizationId ? { order: { organizationId } } : {}) } });
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
