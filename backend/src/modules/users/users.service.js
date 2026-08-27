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

export async function changeUserRole({ id, role, actorId }) {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });

  if (!existing) return null;

  if (actorId === id && role !== "SUPER_ADMIN") {
    const error = new Error("You cannot lower your own role");
    error.statusCode = 400;
    throw error;
  }

  if (existing.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const activeSuperAdmins = await prisma.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    });

    if (activeSuperAdmins <= 1) {
      const error = new Error("At least one active SUPER_ADMIN must remain");
      error.statusCode = 409;
      throw error;
    }
  }

  return prisma.user.update({
    where: { id },
    data: { role },
    select: userListSelect,
  });
}
