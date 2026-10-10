import prisma from "../../config/database.js";
import { computeSettlement } from "../payments/settlement.js";
import { nextSequence } from "../../utils/sequence.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { safeCustomerSelect } from "../../utils/safeSelects.js";

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function generateCustomerNo() {
  const nextNumber = await nextSequence("customer");
  return `CUS-${String(nextNumber).padStart(6, "0")}`;
}

export async function listCustomers({ page, limit, skip, search, organizationId }) {
  const where = {
    organizationId,
    ...(search ? { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { passportNo: { contains: search, mode: "insensitive" } }, { customerNo: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select: safeCustomerSelect }),
    prisma.customer.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function lookupCustomer({ passportNo, phone, organizationId }) {
  const normalizedPassport = passportNo?.trim();
  const normalizedPhone = phone?.trim();
  if (!normalizedPassport && !normalizedPhone) return null;
  return prisma.customer.findFirst({
    where: { organizationId, OR: [normalizedPassport ? { passportNo: normalizedPassport } : undefined, normalizedPhone ? { phone: normalizedPhone } : undefined].filter(Boolean) },
    select: {
      ...safeCustomerSelect,
      orders: { orderBy: { createdAt: "desc" }, take: 10, include: { items: { include: { service: true } }, payments: true, documents: true, history: true } },
    },
  });
}

export async function getCustomerById(id, organizationId) {
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId },
    select: {
      ...safeCustomerSelect,
      orders: { orderBy: { createdAt: "desc" }, include: { items: { include: { service: true } }, payments: true, documents: true, history: true } },
      documents: true,
    },
  });
  if (!customer) return null;

  const orderCount = customer.orders.length;
  // Per-currency balances from the same settlement the payment write path
  // uses (confirmed money only, refunds subtracted). Amounts in different
  // currencies are never added: paidAmount/outstandingAmount stay numbers
  // only when every order is in one currency, otherwise they are null and
  // balancesByCurrency carries the figures.
  const byCurrency = new Map();
  for (const order of customer.orders) {
    const settlement = computeSettlement(order, order.payments);
    const row = byCurrency.get(order.currency) || { currency: order.currency, paid: 0, outstanding: 0 };
    row.paid += Number(settlement.netPaid);
    row.outstanding += Number(settlement.outstanding);
    byCurrency.set(order.currency, row);
  }
  const balancesByCurrency = [...byCurrency.values()].map((row) => ({ ...row, paid: Number(row.paid.toFixed(2)), outstanding: Number(row.outstanding.toFixed(2)) }));
  const single = balancesByCurrency.length <= 1 ? balancesByCurrency[0] || { paid: 0, outstanding: 0, currency: null } : null;
  const lastOrder = customer.orders[0] || null;

  return {
    ...customer,
    summary: {
      orderCount,
      paidAmount: single ? single.paid : null,
      outstandingAmount: single ? single.outstanding : null,
      currency: single ? single.currency : null,
      balancesByCurrency,
      lastOrderId: lastOrder?.id || null,
      lastOrderNumber: lastOrder?.orderNumber || null,
      activeOrders: customer.orders.filter((order) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status)).length,
    },
  };
}

export async function createCustomer(data, organizationId) {
  const customerNo = await generateCustomerNo();
  return prisma.customer.create({
    data: { customerNo, organizationId, fullName: data.fullName, passportNo: data.passportNo, nationality: data.nationality, birthDate: toDateOrNull(data.birthDate), gender: data.gender || null, phone: data.phone || null, email: data.email || null, country: data.country || null, city: data.city || null, address: data.address || null, notes: data.notes || null },
    select: safeCustomerSelect,
  });
}

export async function updateCustomer(id, data, organizationId) {
  const existing = await prisma.customer.findFirst({ where: { id, organizationId } });
  if (!existing) return null;
  return prisma.customer.update({
    where: { id },
    data: { ...data, birthDate: "birthDate" in data ? toDateOrNull(data.birthDate) : undefined },
    select: safeCustomerSelect,
  });
}
