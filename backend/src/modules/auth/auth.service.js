import prisma from "../../config/database.js";
import { comparePassword } from "../../utils/password.js";
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

