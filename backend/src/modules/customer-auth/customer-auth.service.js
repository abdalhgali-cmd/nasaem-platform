import { randomInt } from "node:crypto";
import prisma from "../../config/database.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import { signCustomerToken } from "../../utils/jwt.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage, whatsAppReadiness } from "../../utils/whatsapp.js";
import { generateCustomerNo } from "../customers/customers.service.js";

const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

export const CUSTOMER_PROFILE_SELECT = {
  id: true,
  customerNo: true,
  fullName: true,
  phone: true,
  email: true,
  passportNo: true,
  nationality: true,
  birthDate: true,
  gender: true,
  country: true,
  city: true,
  address: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
};

function sanitizeCustomer(customer) {
  if (!customer) return null;
  const { passwordHash, passwordResetCode, passwordResetExpiresAt, passwordResetAttempts, sessionVersion, ...safe } = customer;
  return safe;
}

// Finds the ONLINE ACCOUNT that owns a phone number (a Customer row with a
// password). Staff-created CRM rows without an account are deliberately never
// returned: they carry other people's orders, passports and payments, and a
// phone number alone is not proof of ownership. Phone numbers are compared as
// typed and in normalized (country-code-prefixed digits-only) form.
async function findAccountByPhone(rawPhone) {
  const trimmed = rawPhone.trim();
  const normalized = normalizePhone(rawPhone);
  return prisma.customer.findFirst({
    where: { passwordHash: { not: null }, OR: [{ phone: trimmed }, { phone: normalized }] },
  });
}

async function isEmailTakenByAnotherAccount(email, excludeCustomerId) {
  if (!email) return false;
  const existing = await prisma.customer.findFirst({
    where: {
      email,
      passwordHash: { not: null },
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

// Registration only ever creates a NEW customer row. It never adopts an
// existing staff-created CRM record that happens to share the phone number:
// doing so handed the CRM history (orders, passport, documents, payments) to
// whoever registered first with a known phone number. Linking an old record
// to an account is a staff action, or must be proven with a code sent to the
// phone (the password-reset channel), never inferred from the number alone.
export async function registerCustomer({ fullName, phone, email, password }) {
  const normalizedPhone = normalizePhone(phone);

  if (await findAccountByPhone(phone)) {
    return { error: "PHONE_TAKEN" };
  }

  const cleanEmail = email?.trim() || null;
  if (await isEmailTakenByAnotherAccount(cleanEmail)) {
    return { error: "EMAIL_TAKEN" };
  }

  const passwordHash = await hashPassword(password);

  const customer = await prisma.customer.create({
    data: {
      customerNo: await generateCustomerNo(),
      fullName,
      phone: normalizedPhone,
      email: cleanEmail,
      passwordHash,
      lastLoginAt: new Date(),
    },
    select: { ...CUSTOMER_PROFILE_SELECT, sessionVersion: true },
  });

  const { sessionVersion, ...profile } = customer;
  return { token: signCustomerToken(customer.id, sessionVersion), customer: profile };
}

export async function loginCustomer({ identifier, password }) {
  const normalizedPhone = normalizePhone(identifier);
  const customer = await prisma.customer.findFirst({
    where: {
      passwordHash: { not: null },
      OR: [{ phone: identifier.trim() }, { phone: normalizedPhone }, { email: identifier.trim() }],
    },
  });

  if (!customer) return null;

  const valid = await comparePassword(password, customer.passwordHash);
  if (!valid) return null;

  await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });

  return { token: signCustomerToken(customer.id, customer.sessionVersion), customer: sanitizeCustomer(customer) };
}

export async function getCustomerProfile(customerId) {
  return prisma.customer.findUnique({ where: { id: customerId }, select: CUSTOMER_PROFILE_SELECT });
}

export async function updateCustomerProfile(customerId, data) {
  if ("email" in data && data.email) {
    if (await isEmailTakenByAnotherAccount(data.email, customerId)) {
      return { error: "EMAIL_TAKEN" };
    }
  }

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...("fullName" in data ? { fullName: data.fullName } : {}),
      ...("email" in data ? { email: data.email || null } : {}),
      ...("passportNo" in data ? { passportNo: data.passportNo || null } : {}),
      ...("nationality" in data ? { nationality: data.nationality || null } : {}),
      ...("country" in data ? { country: data.country || null } : {}),
      ...("city" in data ? { city: data.city || null } : {}),
      ...("address" in data ? { address: data.address || null } : {}),
    },
    select: CUSTOMER_PROFILE_SELECT,
  });

  return { customer };
}

export async function changeCustomerPassword(customerId, currentPassword, newPassword) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer?.passwordHash) return { error: "NOT_FOUND" };

  const valid = await comparePassword(currentPassword, customer.passwordHash);
  if (!valid) return { error: "INVALID_CURRENT_PASSWORD" };

  const passwordHash = await hashPassword(newPassword);
  // Ends every existing session (other phones, the web); the caller gets a
  // fresh token so the device that changed the password stays signed in.
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return { success: true, token: signCustomerToken(customerId, updated.sessionVersion) };
}

export async function requestPasswordReset(rawPhone) {
  // See contact-request-tracking.service.js's requestLoginCode for why
  // "development" is included alongside "test" here — never "production".
  const isDebugOtpAllowed = process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";
  // Checked before the account lookup, so the answer is the same for every
  // number: no code is promised when WhatsApp cannot carry one.
  const channel = await whatsAppReadiness();
  if (channel !== "AVAILABLE" && !isDebugOtpAllowed) return { error: "OTP_CHANNEL_UNAVAILABLE" };

  const customer = await findAccountByPhone(rawPhone);
  // Never reveal whether a phone number has an account — always return a
  // generic success shape; only actually send a code when one does.
  if (!customer?.passwordHash) return { debugCode: undefined };

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const passwordResetExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);

  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordResetCode: code, passwordResetExpiresAt, passwordResetAttempts: 0 },
  });

  if (channel === "AVAILABLE") {
    // Not awaited, so the response time doesn't tell whether the number has
    // an account. A code Meta refused is withdrawn: nobody received it.
    sendWhatsAppMessage(
      customer.phone,
      `رمز إعادة تعيين كلمة المرور لحسابك في نسائم الحرمين: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`
    ).then((outcome) => {
      if (outcome.status === "ACCEPTED") return;
      console.error("Password reset code not sent:", outcome.status, outcome.error || "");
      return prisma.customer.updateMany({
        where: { id: customer.id, passwordResetCode: code },
        data: { passwordResetCode: null, passwordResetExpiresAt: null },
      });
    }).catch(() => {});
  }

  return { debugCode: isDebugOtpAllowed ? code : undefined };
}

export async function resetCustomerPassword(rawPhone, code, newPassword) {
  const customer = await findAccountByPhone(rawPhone);
  if (!customer?.passwordResetCode || !customer.passwordResetExpiresAt) {
    return { error: "INVALID_CODE" };
  }

  if (customer.passwordResetExpiresAt.getTime() < Date.now()) {
    return { error: "INVALID_CODE" };
  }

  if (customer.passwordResetCode !== code) {
    const attempts = customer.passwordResetAttempts + 1;
    const exhausted = attempts >= MAX_RESET_ATTEMPTS;
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordResetAttempts: attempts,
        ...(exhausted ? { passwordResetCode: null, passwordResetExpiresAt: null } : {}),
      },
    });
    return { error: exhausted ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE" };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      passwordHash,
      passwordResetCode: null,
      passwordResetExpiresAt: null,
      passwordResetAttempts: 0,
      // Whoever had the old password (or a device holding a session) is out.
      sessionVersion: { increment: 1 },
    },
  });

  return { success: true };
}

// Logout of one session: the token's jti is refused until it would have
// expired anyway. Expired rows are pruned here so the table stays small.
export async function revokeCustomerToken(customerId, { jti, exp }) {
  if (!jti) return;
  const expiresAt = new Date((exp || Math.floor(Date.now() / 1000)) * 1000);
  await prisma.revokedCustomerToken.upsert({
    where: { jti },
    update: {},
    create: { jti, customerId, expiresAt },
  });
  await prisma.revokedCustomerToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

// Sliding renewal for an already-verified session, so a customer who keeps
// using the app is not sent back to the login screen every 30 days. The old
// token is not revoked: if this response is lost on a bad network the client
// still holds a working session instead of being locked out.
export function renewCustomerToken(customerId, sessionVersion) {
  return signCustomerToken(customerId, sessionVersion);
}
