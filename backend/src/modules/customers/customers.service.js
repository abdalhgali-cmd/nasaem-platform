import prisma from "../../config/database.js";
import { nextSequence } from "../../utils/sequence.js";

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function generateCustomerNo() {
  const nextNumber = await nextSequence("customer");
  return `CUS-${String(nextNumber).padStart(6, "0")}`;
}

export async function listCustomers() {
  return prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerById(id) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      orders: true,
      documents: true,
    },
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
