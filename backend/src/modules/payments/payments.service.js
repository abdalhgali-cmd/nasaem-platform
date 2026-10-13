import prismaPackage from "@prisma/client";

const { Prisma } = prismaPackage;
import crypto from "node:crypto";
import prisma from "../../config/database.js";
import { computeSettlement, refundableAmount, toMoney } from "./settlement.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeUserSelect, safeCustomerSelect } from "../../utils/safeSelects.js";

function toDecimal(value) {
  return new Prisma.Decimal(Number(value || 0).toFixed(2));
}

const paymentInclude = {
  order: { include: { customer: { select: safeCustomerSelect } } },
  reviewedBy: { select: safeUserSelect },
  createdBy: { select: safeUserSelect },
  refundOf: { select: { id: true, amount: true, currency: true, paidAt: true, paymentMethod: true } },
};

// Locks the order row for the rest of the transaction. Every write that
// changes an order's money (record, confirm, reject, refund) takes this lock
// first, so concurrent requests on the same order run one after another and
// each sees the previous one's result: two simultaneous submissions cannot
// both pass the over-payment or over-refund check.
async function lockOrder(tx, orderId, organizationId) {
  const rows = organizationId
    ? await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "organizationId" = ${organizationId} FOR UPDATE`
    : await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, totalAmount: true, currency: true, organizationId: true },
  });
}

async function loadSettlement(db, order) {
  const payments = await db.payment.findMany({
    where: { orderId: order.id },
    select: { id: true, amount: true, currency: true, status: true, kind: true, reviewStatus: true },
  });
  return computeSettlement(order, payments);
}

// `db` must be the transaction client: the plain client cannot see the
// transaction's uncommitted writes. Order.paymentStatus is the *settlement*
// state (UNPAID / PARTIAL / PAID / REFUNDED) derived from confirmed money in
// the order's currency; it is never set directly from a payment row's status.
async function recalculateOrderPaymentStatus(db, orderId) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, totalAmount: true, currency: true },
  });
  const settlement = await loadSettlement(db, order);
  await db.order.update({ where: { id: orderId }, data: { paymentStatus: settlement.status } });
  return settlement;
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function hashRequest(fields) {
  return crypto.createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

// Returns the payment already stored under this key, or throws when the key
// was used for a different request. null when the key is new.
async function findIdempotentReplay(db, idempotencyKey, requestHash, organizationId) {
  if (!idempotencyKey) return null;
  const existing = await db.payment.findUnique({
    where: { idempotencyKey },
    include: { order: { select: { organizationId: true } } },
  });
  if (!existing) return null;
  if (existing.requestHash !== requestHash || (organizationId && existing.order.organizationId !== organizationId)) {
    throw httpError(409, "IDEMPOTENCY_KEY_REUSED", "تم استخدام مفتاح العملية نفسه لعملية مختلفة. أعد تحميل الصفحة ثم حاول مرة أخرى.");
  }
  return existing;
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

// Records money received for an order.
// - currency defaults to the ORDER's currency; a different currency is
//   refused (no approved conversion workflow exists for payments).
// - pendingReview: true stores it as awaiting confirmation (not counted as
//   received until confirmed); otherwise it is a confirmed payment.
// - a confirmed payment may not take net paid above the order total (no
//   customer-credit workflow exists, so over-payment is refused rather than
//   creating an untracked balance).
// - idempotencyKey: a replay returns the stored payment ({ replayed: true });
//   the same key with different data is refused.
export async function createPayment(data, organizationId, actorId = null) {
  const amount = toMoney(data.amount);
  if (!amount.greaterThan(0)) throw httpError(400, "INVALID_AMOUNT", "المبلغ يجب أن يكون أكبر من صفر");
  const pendingReview = Boolean(data.pendingReview);

  const run = () => prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, data.orderId, organizationId);
    if (!order) return null;

    const currency = data.currency || order.currency;
    const requestHash = hashRequest({
      kind: "PAYMENT", orderId: order.id, amount: amount.toFixed(2), currency,
      paymentMethod: data.paymentMethod, referenceNumber: data.referenceNumber || null, pendingReview,
    });
    const replay = await findIdempotentReplay(tx, data.idempotencyKey, requestHash, organizationId);
    if (replay) return { payment: await tx.payment.findUnique({ where: { id: replay.id }, include: paymentInclude }), replayed: true };

    if (currency !== order.currency) {
      throw httpError(400, "CURRENCY_MISMATCH", `عملة الدفعة (${currency}) تختلف عن عملة الطلب (${order.currency}). سجّل الدفعة بعملة الطلب؛ لا يوجد تحويل عملات معتمد للدفعات.`);
    }

    if (!pendingReview) {
      const settlement = await loadSettlement(tx, order);
      if (amount.greaterThan(settlement.outstanding)) {
        throw httpError(409, "OVERPAYMENT", `المبلغ يتجاوز المتبقي على الطلب (${settlement.outstanding} ${order.currency}).`);
      }
    }

    const payment = await tx.payment.create({
      data: {
        orderId: order.id,
        amount,
        currency,
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber || null,
        status: pendingReview ? "UNPAID" : "PAID",
        reviewStatus: pendingReview ? "PENDING" : null,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        kind: "PAYMENT",
        createdByUserId: actorId,
        idempotencyKey: data.idempotencyKey || null,
        requestHash,
      },
    });

    await recalculateOrderPaymentStatus(tx, order.id);
    return { payment: await tx.payment.findUnique({ where: { id: payment.id }, include: paymentInclude }), replayed: false };
  });

  return retryOnIdempotencyRace(run, data.idempotencyKey);
}

// Two concurrent first submissions of the same key on *different* orders do
// not share an order lock; the unique index rejects the second insert and a
// re-run then finds the stored payment (or reports the key reuse).
async function retryOnIdempotencyRace(run, idempotencyKey) {
  try {
    return await run();
  } catch (error) {
    if (idempotencyKey && error?.code === "P2002") return run();
    throw error;
  }
}

// Refunds part or all of one confirmed payment. The refund is its own row
// (kind REFUND) linked to the original, which is never modified.
export async function refundPayment(paymentId, { amount: rawAmount, reason, idempotencyKey }, organizationId, actorId) {
  const amount = toMoney(rawAmount);
  if (!amount.greaterThan(0)) throw httpError(400, "INVALID_AMOUNT", "المبلغ يجب أن يكون أكبر من صفر");

  const run = () => prisma.$transaction(async (tx) => {
    const original = await tx.payment.findFirst({
      where: { id: paymentId, ...(organizationId ? { order: { organizationId } } : {}) },
      select: { id: true, orderId: true },
    });
    if (!original) return null;
    const order = await lockOrder(tx, original.orderId, organizationId);
    if (!order) return null;

    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    const requestHash = hashRequest({ kind: "REFUND", paymentId, amount: amount.toFixed(2), reason });
    const replay = await findIdempotentReplay(tx, idempotencyKey, requestHash, organizationId);
    if (replay) return { payment: await tx.payment.findUnique({ where: { id: replay.id }, include: paymentInclude }), replayed: true };

    if (payment.kind !== "PAYMENT" || payment.status !== "PAID") {
      throw httpError(409, "NOT_REFUNDABLE", "يمكن الاسترجاع من دفعة مؤكدة فقط.");
    }
    const refunds = await tx.payment.findMany({ where: { refundOfPaymentId: paymentId }, select: { amount: true, status: true } });
    const refundable = refundableAmount(payment, refunds);
    if (amount.greaterThan(refundable)) {
      throw httpError(409, "OVER_REFUND", `مبلغ الاسترجاع يتجاوز المتاح للاسترجاع من هذه الدفعة (${refundable.toFixed(2)} ${payment.currency}).`);
    }

    const refund = await tx.payment.create({
      data: {
        orderId: payment.orderId,
        amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        status: "PAID",
        paidAt: new Date(),
        kind: "REFUND",
        refundOfPaymentId: payment.id,
        refundReason: reason,
        createdByUserId: actorId,
        idempotencyKey: idempotencyKey || null,
        requestHash,
      },
    });
    await recalculateOrderPaymentStatus(tx, payment.orderId);
    return { payment: await tx.payment.findUnique({ where: { id: refund.id }, include: paymentInclude }), replayed: false };
  });

  return retryOnIdempotencyRace(run, idempotencyKey);
}

// Confirming moves a payment awaiting review to PAID (now counted as
// received) and stamps the reviewer. Only a PENDING payment can be decided,
// and confirmation is refused if it would take net paid above the total.
export async function confirmPayment(id, reviewedByUserId, organizationId) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.payment.findFirst({ where: { id, ...(organizationId ? { order: { organizationId } } : {}) }, select: { orderId: true } });
    if (!found) return null;
    const order = await lockOrder(tx, found.orderId, organizationId);
    const payment = await tx.payment.findUnique({ where: { id } });
    if (payment.reviewStatus !== "PENDING") {
      throw httpError(409, "NOT_PENDING", "يمكن تأكيد دفعة بانتظار المراجعة فقط.");
    }
    if (payment.currency !== order.currency) {
      throw httpError(409, "CURRENCY_MISMATCH", `عملة الدفعة (${payment.currency}) تختلف عن عملة الطلب (${order.currency}). ارفضها واطلب دفعة بعملة الطلب.`);
    }
    const settlement = await loadSettlement(tx, order);
    if (new Prisma.Decimal(payment.amount).greaterThan(settlement.outstanding)) {
      throw httpError(409, "OVERPAYMENT", `تأكيد هذه الدفعة يتجاوز المتبقي على الطلب (${settlement.outstanding} ${order.currency}).`);
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
    const found = await tx.payment.findFirst({ where: { id, ...(organizationId ? { order: { organizationId } } : {}) }, select: { orderId: true } });
    if (!found) return null;
    await lockOrder(tx, found.orderId, organizationId);
    const payment = await tx.payment.findUnique({ where: { id } });
    if (payment.reviewStatus !== "PENDING") {
      throw httpError(409, "NOT_PENDING", "يمكن رفض دفعة بانتظار المراجعة فقط.");
    }

    await tx.payment.update({
      where: { id },
      data: { status: "UNPAID", reviewStatus: "REJECTED", rejectionReason: reason, reviewedByUserId, reviewedAt: new Date() },
    });
    // A rejected payment never counted as received, so the settlement does
    // not change.
    return tx.payment.findUnique({ where: { id }, include: paymentInclude });
  });
}

// Settlement for one order (used by the order detail API).
export async function getOrderSettlement(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, totalAmount: true, currency: true } });
  if (!order) return null;
  return loadSettlement(prisma, order);
}

export { recalculateOrderPaymentStatus, lockOrder };
