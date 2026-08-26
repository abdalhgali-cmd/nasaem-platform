import prisma from "../../config/database.js";
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

export async function listCustomers({ page, limit, skip, search }) {
  const where = search
    ? { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { passportNo: { contains: search, mode: "insensitive" } }, { customerNo: { contains: search, mode: "insensitive" } }] }
    : undefined;
  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, select: safeCustomerSelect }),
    prisma.customer.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function lookupCustomer({ passportNo, phone }) {
  const normalizedPassport = passportNo?.trim();
  const normalizedPhone = phone?.trim();
  if (!normalizedPassport && !normalizedPhone) return null;
  return prisma.customer.findFirst({
    where: { OR: [normalizedPassport ? { passportNo: normalizedPassport } : undefined, normalizedPhone ? { phone: normalizedPhone } : undefined].filter(Boolean) },
    select: {
      ...safeCustomerSelect,
      orders: { orderBy: { createdAt: "desc" }, take: 10, include: { items: { include: { service: true } }, payments: true, documents: true, history: true } },
    },
  });
}

export async function getCustomerById(id) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      ...safeCustomerSelect,
      orders: { orderBy: { createdAt: "desc" }, include: { items: { include: { service: true } }, payments: true, documents: true, history: true } },
      documents: true,
    },
  });
  if (!customer) return null;

  const orderCount = customer.orders.length;
  const paidAmount = customer.orders.reduce((sum, order) => sum + order.payments.filter((payment) => ["PAID", "CONFIRMED"].includes(payment.status)).reduce((s, payment) => s + Number(payment.amount), 0), 0);
  const outstandingAmount = customer.orders.reduce((sum, order) => sum + Math.max(Number(order.totalAmount) - order.payments.filter((payment) => ["PAID", "CONFIRMED"].includes(payment.status)).reduce((s, payment) => s + Number(payment.amount), 0), 0), 0);
  const lastOrder = customer.orders[0] || null;

  return {
    ...customer,
    summary: {
      orderCount,
      paidAmount: Number(paidAmount.toFixed(2)),
      outstandingAmount: Number(outstandingAmount.toFixed(2)),
      lastOrderId: lastOrder?.id || null,
      lastOrderNumber: lastOrder?.orderNumber || null,
      activeOrders: customer.orders.filter((order) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status)).length,
    },
  };
}

export async function createCustomer(data) {
  const customerNo = await generateCustomerNo();
  return prisma.customer.create({
    data: { customerNo, fullName: data.fullName, passportNo: data.passportNo, nationality: data.nationality, birthDate: toDateOrNull(data.birthDate), gender: data.gender || null, phone: data.phone || null, email: data.email || null, country: data.country || null, city: data.city || null, address: data.address || null, notes: data.notes || null },
    select: safeCustomerSelect,
  });
}

export async function updateCustomer(id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.customer.update({
    where: { id },
    data: { ...data, birthDate: "birthDate" in data ? toDateOrNull(data.birthDate) : undefined },
    select: safeCustomerSelect,
  });
}
