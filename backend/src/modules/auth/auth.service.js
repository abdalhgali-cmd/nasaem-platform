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

// Returns "invalid_current" when currentPassword doesn't match the stored
// hash, otherwise updates passwordHash and returns "success".
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return "not_found";

  const isCurrentValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isCurrentValid) return "invalid_current";

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return "success";
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
