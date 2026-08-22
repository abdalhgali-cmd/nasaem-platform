import prisma from "../../config/database.js";
import { nextSequence } from "../../utils/sequence.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function generateCustomerNo() {
  const nextNumber = await nextSequence("customer");
  return `CUS-${String(nextNumber).padStart(6, "0")}`;
}

export async function listCustomers({ page, limit, skip, search }) {
  const where = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { passportNo: { contains: search, mode: "insensitive" } },
          { customerNo: { contains: search, mode: "insensitive" } },
        ],
      }
    : undefined;

  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.customer.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function lookupCustomer({ passportNo, phone }) {
  const normalizedPassport = passportNo?.trim();
  const normalizedPhone = phone?.trim();
  if (!normalizedPassport && !normalizedPhone) return null;

  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        normalizedPassport ? { passportNo: normalizedPassport } : undefined,
        normalizedPhone ? { phone: normalizedPhone } : undefined,
      ].filter(Boolean),
    },
    include: { orders: { orderBy: { createdAt: "desc" }, take: 10, include: { items: { include: { service: true } } } } },
  });

  return customer;
}

export async function getCustomerById(id) {
  return prisma.customer.findUnique({
    where: { id },
    include: { orders: true, documents: true },
  });
}

export async function createCustomer(data) {
  const customerNo = await generateCustomerNo();

  return prisma.customer.create({
    data: {
      customerNo,
      fullName: data.fullName,
      passportNo: data.passportNo,
      nationality: data.nationality,
      birthDate: toDateOrNull(data.birthDate),
      gender: data.gender || null,
      phone: data.phone || null,
      email: data.email || null,
      country: data.country || null,
      city: data.city || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
}

export async function updateCustomer(id, data) {
  const existing = await prisma.customer.findUnique({ where: { id } });

  if (!existing) return null;

  return prisma.customer.update({
    where: { id },
    data: { ...data, birthDate: "birthDate" in data ? toDateOrNull(data.birthDate) : undefined },
  });
}
