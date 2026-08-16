import { randomInt } from "node:crypto";
import prisma from "../../config/database.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
import { signTrackingToken } from "../../utils/jwt.js";
import { deriveTrackingStatusLabel } from "./contact-request-tracking.status.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function requestLoginCode(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Invalidate any still-live codes for this phone first, so only the most
  // recently requested one can ever be verified.
  await prisma.contactRequestLoginCode.updateMany({
    where: { phone, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.contactRequestLoginCode.create({
    data: { phone, code, expiresAt },
  });

  // Not awaited: same rationale as elsewhere in the codebase (see
  // createContactRequest) — a slow/unreachable WhatsApp API must never delay
  // the response, and this silently no-ops when WHATSAPP_* env vars aren't
  // set (dev/test).
  sendWhatsAppMessage(
    phone,
    `رمز التحقق الخاص بك لتتبع طلبك: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`
  );

  return {
    // Only surfaced when NODE_ENV=test, so automated tests can complete the
    // login flow without a real WhatsApp integration configured.
    debugCode: process.env.NODE_ENV === "test" ? code : undefined,
  };
}

export async function verifyLoginCode(rawPhone, code) {
  const phone = normalizePhone(rawPhone);

  const loginCode = await prisma.contactRequestLoginCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!loginCode) {
    return { success: false, message: "رمز التحقق غير صالح أو منتهي الصلاحية" };
  }

  if (loginCode.code !== code) {
    const attempts = loginCode.attempts + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;

    await prisma.contactRequestLoginCode.update({
      where: { id: loginCode.id },
      data: {
        attempts,
        ...(exhausted ? { consumedAt: new Date() } : {}),
      },
    });

    return {
      success: false,
      message: exhausted
        ? "تم تجاوز عدد المحاولات المسموح، يرجى طلب رمز جديد"
        : "رمز التحقق غير صحيح",
    };
  }

  await prisma.contactRequestLoginCode.update({
    where: { id: loginCode.id },
    data: { consumedAt: new Date() },
  });

  return { success: true, token: signTrackingToken(phone) };
}

export async function listContactRequestsForPhone(phoneNormalized) {
  const requests = await prisma.contactRequest.findMany({
    where: { phoneNormalized },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((request) => ({
    ...request,
    statusLabel: deriveTrackingStatusLabel(request.status),
  }));
}
