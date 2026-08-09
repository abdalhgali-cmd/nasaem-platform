import prisma from "../../config/database.js";
import { hashPassword } from "../../utils/password.js";
import { nextSequence } from "../../utils/sequence.js";

async function generateEmployeeNo() {
  const nextNumber = await nextSequence("employee");
  return `EMP-${String(nextNumber).padStart(4, "0")}`;
}

const userListSelect = {
  id: true,
  employeeNo: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
  branch: true,
};

const userDetailSelect = {
  id: true,
  employeeNo: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  branchId: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  branch: true,
  assignedOrders: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      currency: true,
      createdAt: true,
    },
  },
};

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: userListSelect,
  });
}

export async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: userDetailSelect,
  });
}

export async function createUser(data) {
  const passwordHash = await hashPassword(data.password);
  const employeeNo = await generateEmployeeNo();

  return prisma.user.create({
    data: {
      employeeNo,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone || null,
      passwordHash,
      role: data.role,
      status: data.status,
      branchId: data.branchId || null,
    },
    select: userListSelect,
  });
}

export async function changeUserStatus(id, status) {
  return prisma.user.update({
    where: { id },
    data: { status },
    select: userListSelect,
  });
}

export async function resetUserPassword(id, password) {
  const existing = await prisma.user.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  const passwordHash = await hashPassword(password);

  return prisma.user.update({
    where: { id },
    data: { passwordHash },
    select: userListSelect,
  });
}
