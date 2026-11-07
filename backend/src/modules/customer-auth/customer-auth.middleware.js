import prisma from "../../config/database.js";
import { verifyCustomerToken } from "../../utils/jwt.js";

function extractCustomerToken(req) {
  const authorization = req.headers?.authorization;
  const bearerToken =
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : null;
  return bearerToken || req.cookies?.customerAccessToken || null;
}

const SESSION_SELECT = {
  id: true,
  customerNo: true,
  fullName: true,
  phone: true,
  email: true,
  passportNo: true,
  nationality: true,
  country: true,
  city: true,
  address: true,
  passwordHash: true,
  sessionVersion: true,
  createdAt: true,
  organizationId: true,
  organization: { select: { active: true } },
};

// Machine-readable reasons sent with every customer-session 401, so a client
// (the Android app) can tell "this session is over" apart from "the server
// could not check it right now" (503 below) without parsing Arabic text.
export const SESSION_ERROR = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_INVALID: "SESSION_INVALID",
  SESSION_REVOKED: "SESSION_REVOKED",
  SESSION_CHECK_UNAVAILABLE: "SESSION_CHECK_UNAVAILABLE",
};

class SessionRejected extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const JWT_ERROR_NAMES = new Set(["JsonWebTokenError", "NotBeforeError"]);

function decodeToken(token) {
  try {
    return verifyCustomerToken(token);
  } catch (error) {
    if (error?.name === "TokenExpiredError") throw new SessionRejected(SESSION_ERROR.SESSION_EXPIRED);
    if (JWT_ERROR_NAMES.has(error?.name) || error?.message === "Invalid token scope") {
      throw new SessionRejected(SESSION_ERROR.SESSION_INVALID);
    }
    // e.g. JWT_SECRET missing: a server fault, not proof the session is bad.
    throw error;
  }
}

// Resolves a token to its live Customer, or throws SessionRejected when the
// backend can positively say the session is over. Any other error (database
// unreachable, misconfiguration) propagates unchanged: it says nothing about
// the session, and must never be reported to a client as "logged out".
export async function resolveCustomerSession(token) {
  const payload = decodeToken(token);

  const customer = await prisma.customer.findUnique({ where: { id: payload.sub }, select: SESSION_SELECT });

  // passwordHash === null means this Customer row was never turned into an
  // account (or had its account removed); an inactive organization is
  // suspended. Either way the signed token no longer grants access.
  if (!customer || !customer.passwordHash || !customer.organization.active) {
    throw new SessionRejected(SESSION_ERROR.SESSION_REVOKED);
  }

  // Password change/reset bumps sessionVersion, ending every older session.
  // Tokens from before this claim existed count as version 0.
  if ((payload.sv ?? 0) !== customer.sessionVersion) {
    throw new SessionRejected(SESSION_ERROR.SESSION_REVOKED);
  }

  // Tokens issued before jti existed cannot be revoked one at a time; they
  // still expire, and password change/reset still ends them.
  if (payload.jti) {
    const revoked = await prisma.revokedCustomerToken.findUnique({ where: { jti: payload.jti }, select: { jti: true } });
    if (revoked) throw new SessionRejected(SESSION_ERROR.SESSION_REVOKED);
  }

  const { passwordHash, sessionVersion, organization, ...safeCustomer } = customer;
  return { customer: safeCustomer, payload, sessionVersion };
}

const REJECTION_MESSAGES = {
  [SESSION_ERROR.SESSION_EXPIRED]: "الجلسة منتهية، يرجى تسجيل الدخول مجددًا",
  [SESSION_ERROR.SESSION_INVALID]: "الجلسة غير صالحة، يرجى تسجيل الدخول مجددًا",
  [SESSION_ERROR.SESSION_REVOKED]: "تم إنهاء الجلسة، يرجى تسجيل الدخول مجددًا",
};

export async function attachOptionalCustomer(req, res, next) {
  try {
    const token = extractCustomerToken(req);
    if (!token) return next();
    const { customer } = await resolveCustomerSession(token);
    req.customer = { id: customer.id, organizationId: customer.organizationId };
    req.organizationId = customer.organizationId;
  } catch {
    // Anonymous public submissions remain valid when an optional cookie is invalid.
  }
  return next();
}

export async function requireCustomerAuth(req, res, next) {
  const token = extractCustomerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب", code: SESSION_ERROR.AUTH_REQUIRED });
  }

  let session;
  try {
    session = await resolveCustomerSession(token);
  } catch (error) {
    if (error instanceof SessionRejected) {
      return res.status(401).json({ success: false, message: REJECTION_MESSAGES[error.code], code: error.code });
    }
    console.error("[customer-auth] session check failed", error);
    return res.status(503).json({
      success: false,
      message: "تعذر التحقق من الجلسة حاليًا، حاول مرة أخرى بعد قليل",
      code: SESSION_ERROR.SESSION_CHECK_UNAVAILABLE,
    });
  }

  req.customer = session.customer;
  req.customerToken = { jti: session.payload.jti || null, exp: session.payload.exp, sessionVersion: session.sessionVersion };
  req.organizationId = session.customer.organizationId;
  return next();
}
