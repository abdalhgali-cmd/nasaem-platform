import crypto from "crypto";
import prisma from "../../config/database.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import { signAccessToken } from "../../utils/jwt.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { logActivity } from "../../utils/activityLog.js";

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

  // Same status requireAuth enforces on every later request — reject here
  // too instead of issuing a token for an account that could never use it.
  if (user.status !== "ACTIVE") {
    return "inactive";
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
      department: true,
      lastLogin: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}

// --- Staff self-service password reset (WhatsApp OTP) ---
//
// Deliberately duplicates customer-auth.service.js's small helpers/constants
// rather than sharing a kernel — matches how this codebase already
// duplicates small per-module helpers instead of building a shared one.
// TTL is longer than the login-code TTL (10 min vs 5) since a password
// reset involves more typing than a login code.
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_HOURLY_CAP = 5;

function hashResetCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function tooManyRequests(message) {
  return Object.assign(new Error(message), { statusCode: 429 });
}

// No-information-leak convention, matching customer-auth's requestLoginCode:
// an unknown email, an inactive account, or an account with no phone all
// return the exact same shape as a real request — a resetCodeId that no row
// matches — so the response never discloses which emails exist or are
// reset-eligible. (Timing is not equalized; accepted the same way
// customer-auth accepts it today.)
export async function requestStaffPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.status !== "ACTIVE" || !user.phone) {
    return { resetCodeId: crypto.randomUUID() };
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCodes = await prisma.staffPasswordResetCode.findMany({
    where: { userId: user.id, createdAt: { gte: hourAgo } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recentCodes.length >= RESET_HOURLY_CAP) {
    throw tooManyRequests("تم تجاوز عدد المحاولات المسموح به، حاول لاحقًا");
  }

  if (recentCodes[0] && Date.now() - recentCodes[0].createdAt.getTime() < RESET_RESEND_COOLDOWN_MS) {
    throw tooManyRequests("الرجاء الانتظار قليلًا قبل طلب رمز جديد");
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

  const resetCode = await prisma.staffPasswordResetCode.create({
    data: {
      userId: user.id,
      codeHash: hashResetCode(code),
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
    },
  });

  // Not awaited: same fire-and-forget convention as every other WhatsApp
  // send in this codebase. Uses the OTP template (not the staff-alert
  // default) — same reasoning as customer-auth's requestLoginCode. Sent
  // verbatim to user.phone: normalizePhone is Sudan-only and would reject a
  // non-Sudanese staff number.
  sendWhatsAppMessage(user.phone, `رمز إعادة تعيين كلمة المرور: ${code}\nصالح لمدة 10 دقائق. إذا لم تطلب ذلك، تجاهل هذه الرسالة.`, {
    templateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME,
  });

  return {
    resetCodeId: resetCode.id,
    // Same test-only mechanism as customer-auth's requestLoginCode.
    ...(process.env.NODE_ENV === "test" ? { debugCode: code } : {}),
  };
}

// Same generic-null-on-every-failure convention as customer-auth's
// verifyLoginCode — wrong code, expired, consumed, attempts-exhausted, and
// an unknown/throwaway resetCodeId all fail identically.
export async function resetStaffPasswordWithCode(resetCodeId, code, newPassword, req) {
  const resetCode = await prisma.staffPasswordResetCode.findUnique({ where: { id: resetCodeId } });

  if (!resetCode) return null;
  if (resetCode.consumedAt) return null;
  if (resetCode.expiresAt.getTime() < Date.now()) return null;
  if (resetCode.attempts >= RESET_MAX_ATTEMPTS) return null;

  if (resetCode.codeHash !== hashResetCode(code)) {
    await prisma.staffPasswordResetCode.update({
      where: { id: resetCodeId },
      data: { attempts: { increment: 1 } },
    });
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: resetCode.userId } });

  // The account could have been suspended between request and confirm.
  if (!user || user.status !== "ACTIVE") return null;

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.staffPasswordResetCode.update({
      where: { id: resetCodeId },
      data: { consumedAt: new Date() },
    }),
    prisma.staffPasswordResetCode.updateMany({
      where: { userId: user.id, consumedAt: null, id: { not: resetCodeId } },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
  ]);

  logActivity({
    userId: user.id,
    action: "USER_PASSWORD_RESET_SELF_SERVICE",
    entity: "User",
    entityId: user.id,
    req,
  });

  return { email: user.email };
}
