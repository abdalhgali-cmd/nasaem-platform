import crypto from "node:crypto";
import prisma from "../config/database.js";
import { normalizePhone } from "./phone.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

// Proof-of-phone-ownership codes (OTP). Used wherever an action must only be
// possible for the person who actually controls a phone number.
//
//  * Codes are 6 digits from a CSPRNG and valid for 10 minutes.
//  * Only an HMAC(JWT_SECRET, purpose:phone:code) is stored.
//  * A code is bound to its purpose and phone, single-use, and burned after
//    MAX_ATTEMPTS wrong guesses.
//  * Issuing is throttled per phone (MAX_ISSUES_PER_WINDOW / ISSUE_WINDOW_MS)
//    in addition to any per-IP limiter on the route, so one victim's phone
//    cannot be spammed from many IPs.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const ISSUE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_ISSUES_PER_WINDOW = 3;

function hashCode(purpose, phone, code) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return crypto.createHmac("sha256", secret).update(`${purpose}:${phone}:${code}`).digest("hex");
}

function safeEqualHex(a, b) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function tooManyRequests(message) {
  const error = new Error(message);
  error.statusCode = 429;
  return error;
}

// Returns { debugCode } — debugCode is only ever set under NODE_ENV test/dev so
// local development works without a WhatsApp provider; never in production.
export async function issuePhoneCode({ phone: rawPhone, purpose, message }) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { debugCode: undefined };

  const recent = await prisma.phoneVerification.count({
    where: { phone, purpose, createdAt: { gt: new Date(Date.now() - ISSUE_WINDOW_MS) } },
  });
  if (recent >= MAX_ISSUES_PER_WINDOW) {
    throw tooManyRequests("تم طلب رموز كثيرة لهذا الرقم، يرجى المحاولة لاحقًا");
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.phoneVerification.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.phoneVerification.create({
      data: { phone, purpose, codeHash: hashCode(purpose, phone, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    }),
  ]);

  sendWhatsAppMessage(phone, message(code));

  const isDebugOtpAllowed = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";
  return { debugCode: isDebugOtpAllowed ? code : undefined };
}

// Checks a code WITHOUT consuming it (so a later, unrelated validation failure
// does not burn a correct code). Wrong guesses are counted and burn the code
// after MAX_ATTEMPTS. Returns the verification row on success, or null.
export async function checkPhoneCode({ phone: rawPhone, purpose, code }) {
  const phone = normalizePhone(rawPhone);
  if (!phone || typeof code !== "string" || !/^\d{6}$/.test(code)) return null;

  const row = await prisma.phoneVerification.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;

  if (!safeEqualHex(row.codeHash, hashCode(purpose, phone, code))) {
    const attempts = row.attempts + 1;
    await prisma.phoneVerification.update({
      where: { id: row.id },
      data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}) },
    });
    return null;
  }
  return row;
}

// Atomic single-use consumption: of two concurrent requests presenting the same
// valid code, exactly one gets `true`. Accepts a transaction client.
export async function consumePhoneCode(row, db = prisma) {
  const { count } = await db.phoneVerification.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return count === 1;
}
