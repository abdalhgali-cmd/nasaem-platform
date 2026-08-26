import { randomInt } from "node:crypto";
import prisma from "../../config/database.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import { signCustomerToken } from "../../utils/jwt.js";
import { normalizePhone } from "../../utils/phone.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";
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
  const { passwordHash, passwordResetCode, passwordResetExpiresAt, passwordResetAttempts, ...safe } = customer;
  return safe;
}

// Finds an existing CRM-created Customer row by phone without a full-table
// scan: staff-entered phone numbers are compared both as typed and in
// normalized (country-code-prefixed digits-only) form, which covers the
// overwhelming majority of real records. A customer whose staff-entered
// phone was typed in some other, unmatched format simply registers as a
// brand-new account instead of being merged into their existing CRM
// history — an acceptable, disclosed trade-off rather than an unbounded
// scan-and-normalize over the whole customer table.
async function findCustomerByPhone(rawPhone) {
  const trimmed = rawPhone.trim();
  const normalized = normalizePhone(rawPhone);
  return prisma.customer.findFirst({
    where: { OR: [{ phone: trimmed }, { phone: normalized }] },
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

export async function registerCustomer({ fullName, phone, email, password }) {
  const normalizedPhone = normalizePhone(phone);
  const existing = await findCustomerByPhone(phone);

  if (existing?.passwordHash) {
    return { error: "PHONE_TAKEN" };
  }

  const cleanEmail = email?.trim() || null;
  if (await isEmailTakenByAnotherAccount(cleanEmail, existing?.id)) {
    return { error: "EMAIL_TAKEN" };
  }

  const passwordHash = await hashPassword(password);

  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: {
          fullName: fullName || existing.fullName,
          email: cleanEmail || existing.email,
          passwordHash,
          lastLoginAt: new Date(),
        },
        select: CUSTOMER_PROFILE_SELECT,
      })
    : await prisma.customer.create({
        data: {
          customerNo: await generateCustomerNo(),
          fullName,
          phone: normalizedPhone,
          email: cleanEmail,
          passwordHash,
          lastLoginAt: new Date(),
        },
        select: CUSTOMER_PROFILE_SELECT,
      });

  return { token: signCustomerToken(customer.id), customer };
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

  return { token: signCustomerToken(customer.id), customer: sanitizeCustomer(customer) };
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
  await prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
  return { success: true };
}

export async function requestPasswordReset(rawPhone) {
  const customer = await findCustomerByPhone(rawPhone);
  // Never reveal whether a phone number has an account — always return a
  // generic success shape; only actually send a code when one does.
  if (!customer?.passwordHash) return { debugCode: undefined };

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const passwordResetExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);

  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordResetCode: code, passwordResetExpiresAt, passwordResetAttempts: 0 },
  });

  sendWhatsAppMessage(
    customer.phone,
    `رمز إعادة تعيين كلمة المرور لحسابك في نسائم الحرمين: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`
  );

  return { debugCode: process.env.NODE_ENV === "test" ? code : undefined };
}

export async function resetCustomerPassword(rawPhone, code, newPassword) {
  const customer = await findCustomerByPhone(rawPhone);
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
    },
  });

  return { success: true };
}
