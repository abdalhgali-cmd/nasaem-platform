import prisma from "../../config/database.js";
import { comparePassword } from "../../utils/password.js";
import { signAccessToken } from "../../utils/jwt.js";
import { hashPassword } from "../../utils/password.js";

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
      sessionVersion: true,
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

  // A suspended/inactive account must not receive a token: every request
  // would be refused anyway, and the back-office would bounce between the
  // dashboard and the login page.
  if (user.status !== "ACTIVE") {
    return { inactive: true };
  }

  const token = issueStaffToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const { sessionVersion, ...rest } = user;
  return {
    token,
    user: sanitizeUser(rest),
  };
}

export function issueStaffToken(user) {
  return signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    sv: user.sessionVersion ?? 0,
  });
}

// Logout: revokes exactly the presented token until it would have expired
// anyway. Idempotent (a repeated logout of the same token is a no-op).
export async function revokeStaffToken({ tokenId, userId, exp }) {
  const expiresAt = exp ? new Date(exp * 1000) : new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await prisma.revokedStaffToken.upsert({
    where: { tokenId },
    update: {},
    create: { tokenId, userId, expiresAt },
  });
}

// Password change: verifies the current password, stores the new hash and
// bumps sessionVersion, which ends every other session of this account. The
// caller gets a fresh token for the current device.
export async function changeStaffPassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, passwordHash: true },
  });
  if (!user) return { error: "NOT_FOUND" };
  if (!(await comparePassword(currentPassword, user.passwordHash))) return { error: "WRONG_PASSWORD" };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
    select: { id: true, role: true, email: true, sessionVersion: true },
  });
  return { token: issueStaffToken(updated) };
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

