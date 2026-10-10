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

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

// Every user-management query is scoped to the actor's organization. The
// organization always comes from the authenticated session (req.user), never
// from the request body: SUPER_ADMIN is the highest role *inside* an
// organization (see tests/organizationIsolation.test.js), not a platform
// operator, so it gets no cross-organization reach either.
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

async function assertBranchInOrganization(db, branchId, organizationId) {
  if (!branchId) return;
  const branch = await db.branch.findFirst({ where: { id: branchId, organizationId }, select: { id: true } });
  if (!branch) throw httpError(400, "الفرع المحدد غير موجود في مؤسستك", "BRANCH_NOT_IN_ORGANIZATION");
}

export async function createUser(data, organizationId) {
  await assertBranchInOrganization(prisma, data.branchId, organizationId);
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
      organizationId,
    },
    select: userListSelect,
  });
}

// Serializes every change that can reduce an organization's set of active
// SUPER_ADMINs. Without it two concurrent requests (A suspends B while B
// suspends A) both read "2 active" and both succeed, leaving none. The lock
// is transaction-scoped and per organization, so unrelated tenants never
// wait on each other.
async function lockOrganizationAdministration(tx, organizationId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-administration:${organizationId}`}))`;
}

async function assertAnotherActiveSuperAdmin(tx, organizationId, excludingUserId) {
  const others = await tx.user.count({
    where: { organizationId, role: "SUPER_ADMIN", status: "ACTIVE", id: { not: excludingUserId } },
  });
  if (others < 1) {
    throw httpError(409, "يجب أن يبقى مدير أعلى نشط واحد على الأقل في المؤسسة", "LAST_SUPER_ADMIN");
  }
}

// Rules (apply to status and role changes alike):
// - target outside the actor's organization -> null (404, same as unknown)
// - only a SUPER_ADMIN may change a SUPER_ADMIN account
// - nobody can deactivate themselves or lower their own role
// - the last active SUPER_ADMIN of an organization can be neither
//   deactivated nor demoted
// Deactivation also bumps sessionVersion so that existing sessions stay
// invalid if the account is later re-activated.
export async function changeUserStatus({ id, status, actor }) {
  return prisma.$transaction(async (tx) => {
    await lockOrganizationAdministration(tx, actor.organizationId);
    const existing = await tx.user.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true, role: true, status: true },
    });
    if (!existing) return null;

    if (existing.id === actor.id && status !== "ACTIVE") {
      throw httpError(400, "لا يمكنك إيقاف أو تعطيل حسابك بنفسك", "SELF_DEACTIVATION");
    }
    if (existing.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
      throw httpError(403, "لا يمكن تعديل حساب المدير الأعلى إلا بواسطة مدير أعلى", "SUPER_ADMIN_PROTECTED");
    }
    if (existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE" && status !== "ACTIVE") {
      await assertAnotherActiveSuperAdmin(tx, actor.organizationId, existing.id);
    }

    const deactivating = existing.status === "ACTIVE" && status !== "ACTIVE";
    const user = await tx.user.update({
      where: { id },
      data: { status, ...(deactivating ? { sessionVersion: { increment: 1 } } : {}) },
      select: userListSelect,
    });
    return { user, before: { status: existing.status }, after: { status: user.status } };
  });
}

export async function changeUserRole({ id, role, actor }) {
  return prisma.$transaction(async (tx) => {
    await lockOrganizationAdministration(tx, actor.organizationId);
    const existing = await tx.user.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true, role: true, status: true },
    });
    if (!existing) return null;

    if (actor.id === id && role !== actor.role) {
      throw httpError(400, "لا يمكنك تغيير دورك بنفسك", "SELF_ROLE_CHANGE");
    }
    if (existing.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") {
      throw httpError(403, "لا يمكن تعديل حساب المدير الأعلى إلا بواسطة مدير أعلى", "SUPER_ADMIN_PROTECTED");
    }
    if (existing.role === "SUPER_ADMIN" && existing.status === "ACTIVE" && role !== "SUPER_ADMIN") {
      await assertAnotherActiveSuperAdmin(tx, actor.organizationId, existing.id);
    }

    const user = await tx.user.update({ where: { id }, data: { role }, select: userListSelect });
    return { user, before: { role: existing.role }, after: { role: user.role } };
  });
}
