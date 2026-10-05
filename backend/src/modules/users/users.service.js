import prisma from "../../config/database.js";
import { hashPassword } from "../../utils/password.js";
import { generateTemporaryPassword } from "../../utils/staffPassword.js";
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

// Everything here is scoped to the acting staff member's organisation: a user of
// another organisation is treated exactly like a nonexistent one.
export async function listUsers(organizationId) {
  return prisma.user.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: userListSelect,
  });
}

export async function getUserById(id, organizationId) {
  return prisma.user.findFirst({
    where: { id, organizationId },
    select: userDetailSelect,
  });
}

export async function createUser(data, organizationId) {
  const passwordHash = await hashPassword(data.password);
  const employeeNo = await generateEmployeeNo();

  return prisma.user.create({
    data: {
      organizationId,
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

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const ADMIN_MANAGED_ROLES = ["EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"];

// An ADMIN manages ordinary staff only; SUPER_ADMIN manages everyone. Neither
// may act on their own account through these admin operations.
function assertMayManage(actor, target, { allowSelf = false } = {}) {
  if (actor.id === target.id && !allowSelf) throw httpError("Use your own account settings for this", 400);
  if (actor.role !== "SUPER_ADMIN" && !ADMIN_MANAGED_ROLES.includes(target.role)) {
    throw httpError("Only a SUPER_ADMIN can manage this account", 403);
  }
}

async function activeSuperAdminCount(organizationId) {
  return prisma.user.count({ where: { organizationId, role: "SUPER_ADMIN", status: "ACTIVE" } });
}

export async function changeUserStatus({ id, status, actor }) {
  const existing = await prisma.user.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, role: true, status: true } });
  if (!existing) return null;
  assertMayManage(actor, existing);

  if (existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE" && status !== "ACTIVE" && (await activeSuperAdminCount(actor.organizationId)) <= 1) {
    throw httpError("At least one active SUPER_ADMIN must remain", 409);
  }

  return prisma.user.update({ where: { id }, data: { status }, select: userListSelect });
}

export async function changeUserRole({ id, role, actor }) {
  const existing = await prisma.user.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, role: true, status: true } });

  if (!existing) return null;

  if (actor.id === id && role !== "SUPER_ADMIN") {
    throw httpError("You cannot lower your own role", 400);
  }

  if (existing.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN" && (await activeSuperAdminCount(actor.organizationId)) <= 1) {
    throw httpError("At least one active SUPER_ADMIN must remain", 409);
  }

  return prisma.user.update({
    where: { id },
    data: { role },
    select: userListSelect,
  });
}

// Admin-initiated reset. Supplying `newPassword` sets exactly that; omitting it
// generates a one-time password returned ONCE in the response. Either way the
// user's existing sessions are revoked (passwordChangedAt).
export async function resetUserPassword({ id, newPassword, actor }) {
  const existing = await prisma.user.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, role: true } });
  if (!existing) return null;
  assertMayManage(actor, existing);

  const temporaryPassword = newPassword ? null : generateTemporaryPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword ?? temporaryPassword), passwordChangedAt: new Date() },
  });
  return { id, temporaryPassword };
}
