import prisma from "../../config/database.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { signAccessToken } from "../../utils/jwt.js";

function sanitizeUser(user) {
  if (!user) return null;

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    // Keep login compatible while an existing Production database is
    // rolling forward through the Organization migration. Prisma's default
    // select includes every model column, so a not-yet-migrated
    // organizationId would otherwise turn even an invalid login into a 500.
    select: {
      id: true,
      employeeNo: true,
      fullName: true,
      email: true,
      phone: true,
      passwordHash: true,
      role: true,
      status: true,
      branchId: true,
      lastLogin: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return null;
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);

  if (!isPasswordValid) {
    return null;
  }

  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  return {
    token,
    user: sanitizeUser(user),
  };
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    },
  });

  return user;
}


// Verifies the current password, stores the new one and revokes older sessions.
// Returns a fresh token for the caller (so the session that changed the password
// keeps working) or { error } for a wrong current password / unchanged password.
export async function changeOwnPassword({ userId, currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true, passwordHash: true } });
  if (!user) return { error: "NOT_FOUND" };
  if (!(await comparePassword(currentPassword, user.passwordHash))) return { error: "WRONG_PASSWORD" };
  if (await comparePassword(newPassword, user.passwordHash)) return { error: "SAME_PASSWORD" };

  // Sessions issued before this instant are revoked (see requireAuth). The token
  // returned below is issued after it, so the caller's own session continues.
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
  return { token: signAccessToken({ sub: user.id, role: user.role, email: user.email }) };
}
