import prisma from "../../config/database.js";

export async function listActivePaymentAccounts(currency) {
  return prisma.paymentAccount.findMany({
    where: {
      active: true,
      ...(currency ? { currency } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      iban: true,
      currency: true,
    },
  });
}

export async function listPaymentAccounts() {
  return prisma.paymentAccount.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createPaymentAccount(data) {
  return prisma.paymentAccount.create({ data });
}

export async function updatePaymentAccount(id, data) {
  return prisma.paymentAccount.update({ where: { id }, data });
}
