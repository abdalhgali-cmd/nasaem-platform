import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import prisma from "../../config/database.js";
import { generateCustomerNo } from "../customers/customers.service.js";
import { signCustomerToken } from "../../utils/jwt.js";
import { logActivity } from "../../utils/activityLog.js";

const client = new OAuth2Client();
const cookieName = "googleLoginChallenge";
const options = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", path: "/api/customer-auth" });
const failure = (status, code, message) => Object.assign(new Error(message), { status, code });

export function googleIdentity(payload, nonce) {
  if (!payload || payload.nonce !== nonce || !nonce || payload.email_verified !== true ||
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
      typeof payload.email !== "string" || payload.email.length > 200) {
    throw failure(401, "GOOGLE_IDENTITY_INVALID", "تعذّر التحقق من حساب Google. أعد المحاولة.");
  }
  return { subject: payload.sub, email: payload.email, name: String(payload.name || payload.email).slice(0, 200) };
}

export function googleChallenge(req, res) {
  res.set("Cache-Control", "no-store");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.json({ success: true, data: { enabled: false } });
  const nonce = randomBytes(32).toString("base64url");
  const challenge = jwt.sign({ nonce }, process.env.JWT_SECRET, {
    algorithm: "HS256", audience: "google-login", expiresIn: "5m",
  });
  res.cookie(cookieName, challenge, { ...options(), maxAge: 300000 });
  return res.json({ success: true, data: { enabled: true, clientId, nonce } });
}

export async function googleLogin(req, res, next) {
  res.set("Cache-Control", "no-store");
  res.clearCookie(cookieName, options());
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw failure(503, "GOOGLE_NOT_CONFIGURED", "تسجيل Google غير متاح حاليًا.");
    const credential = req.body?.credential;
    if (typeof credential !== "string" || !credential.trim() || credential.length > 16000) {
      throw failure(400, "GOOGLE_CREDENTIAL_REQUIRED", "أعد تسجيل الدخول باستخدام Google.");
    }
    let identity;
    try {
      const challenge = jwt.verify(req.cookies?.[cookieName] || "", process.env.JWT_SECRET,
        { algorithms: ["HS256"], audience: "google-login" });
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      identity = googleIdentity(ticket.getPayload(), challenge.nonce);
    } catch {
      throw failure(401, "GOOGLE_IDENTITY_INVALID", "تعذّر التحقق من حساب Google. أعد المحاولة.");
    }
    let customer = await prisma.customer.findUnique({ where: { googleSubject: identity.subject } });
    if (!customer) {
      const existing = await prisma.customer.findFirst({ where: {
        email: { equals: identity.email, mode: "insensitive" },
        OR: [{ passwordHash: { not: null } }, { googleSubject: { not: null } }],
      }, select: { id: true } });
      // A matching contact email is not proof of account ownership.
      if (existing) throw failure(409, "GOOGLE_ACCOUNT_LINK_REQUIRED", "لديك حساب بهذا البريد. ادخل بالطريقة الحالية؛ ربط Google يحتاج تأكيد ملكية الحساب.");
      try {
        customer = await prisma.customer.create({ data: {
          customerNo: await generateCustomerNo(), fullName: identity.name,
          email: identity.email, googleSubject: identity.subject,
        } });
      } catch (error) {
        if (error.code !== "P2002") throw error;
        customer = await prisma.customer.findUnique({ where: { googleSubject: identity.subject } });
        if (!customer) throw error;
      }
    }
    const organization = await prisma.organization.findUnique({ where: { id: customer.organizationId }, select: { active: true } });
    if (!organization?.active) throw failure(403, "ACCOUNT_UNAVAILABLE", "الحساب غير متاح.");
    await prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } });
    const token = signCustomerToken(customer.id, customer.sessionVersion);
    logActivity({ action: "CUSTOMER_GOOGLE_LOGIN", entity: "Customer", entityId: customer.id, req });
    // Same session scope, lifetime and revocation checks as password login.
    const { getCustomerTokenMaxAgeMs } = await import("../../utils/jwt.js");
    res.cookie("customerAccessToken", token, { ...options(), path: "/", maxAge: getCustomerTokenMaxAgeMs() });
    return res.json({ success: true, data: { token, customer: {
      id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone,
    } } });
  } catch (error) { next(error); }
}
