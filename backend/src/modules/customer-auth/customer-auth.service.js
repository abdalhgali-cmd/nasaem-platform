import crypto from "crypto";
import prisma from "../../config/database.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_CAP = 5;

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function tooManyRequests(message) {
  return Object.assign(new Error(message), { statusCode: 429 });
}

// Sends a WhatsApp one-time code and stores only its hash. Enforces a
// per-phone cooldown/hourly cap in the DB (not just the route's IP-based
// rate limiter) since spamming one victim's phone from many IPs would
// otherwise slip past IP limiting entirely.
export async function requestLoginCode(rawPhone) {
  const phone = normalizePhone(rawPhone);

  if (!phone) {
    throw badRequest("أدخل رقم هاتف سوداني صحيح");
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCodes = await prisma.customerLoginCode.findMany({
    where: { phone, createdAt: { gte: hourAgo } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (recentCodes.length >= HOURLY_CAP) {
    throw tooManyRequests("تم تجاوز عدد المحاولات المسموح به، حاول لاحقًا");
  }

  if (recentCodes[0] && Date.now() - recentCodes[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw tooManyRequests("الرجاء الانتظار قليلًا قبل طلب رمز جديد");
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

  const loginCode = await prisma.customerLoginCode.create({
    data: {
      phone,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  // Not awaited: a slow/unreachable WhatsApp API must not delay the
  // response, same convention as createContactRequest's admin alert.
  sendWhatsAppMessage(phone, `رمز الدخول لمتابعة طلباتك: ${code}\nصالح لمدة 5 دقائق.`, {
    templateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME,
  });

  return {
    loginCodeId: loginCode.id,
    // Only ever present outside production — lets tests recover the code
    // without persisting the plaintext anywhere. Never set in a real
    // environment: NODE_ENV must be "test" exactly.
    ...(process.env.NODE_ENV === "test" ? { debugCode: code } : {}),
  };
}

// Every failure path returns the same generic outcome (null) regardless of
// *why* it failed — wrong code, expired, already consumed, or attempts
// exhausted — so a caller can't use response differences as an oracle.
export async function verifyLoginCode(loginCodeId, code) {
  const loginCode = await prisma.customerLoginCode.findUnique({ where: { id: loginCodeId } });

  if (!loginCode) return null;
  if (loginCode.consumedAt) return null;
  if (loginCode.expiresAt.getTime() < Date.now()) return null;
  if (loginCode.attempts >= MAX_ATTEMPTS) return null;

  if (loginCode.codeHash !== hashCode(code)) {
    await prisma.customerLoginCode.update({
      where: { id: loginCodeId },
      data: { attempts: { increment: 1 } },
    });
    return null;
  }

  await prisma.customerLoginCode.update({
    where: { id: loginCodeId },
    data: { consumedAt: new Date() },
  });

  return { phone: loginCode.phone };
}
