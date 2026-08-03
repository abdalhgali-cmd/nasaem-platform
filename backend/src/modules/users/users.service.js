import prisma from "../../config/database.js";
import { hashPassword } from "../../utils/password.js";

async function generateEmployeeNo() {
  const count = await prisma.user.count();
  const nextNumber = count + 1;
  return `EMP-${String(nextNumber).padStart(4, "0")}`;
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      branch: true,
    },
    select: {
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
    },
  });
}

export async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      branch: true,
      assignedOrders: true,
    },
    select: {
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
    },
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
    select: {
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
    },
  });
}

export async function changeUserStatus(id, status) {
  return prisma.user.update({
    where: { id },
    data: { status },
    select: {
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
    },
  });
}
