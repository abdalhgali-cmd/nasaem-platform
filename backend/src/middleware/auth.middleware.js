import crypto from "node:crypto";
import prisma from "../config/database.js";
import { verifyAccessToken } from "../utils/jwt.js";

// Staff session errors. A 401 means the backend positively knows the session
// is over (the back-office then sends the user to login). A 503 means the
// session could not be checked right now (database or configuration
// failure) and says nothing about the session itself: the back-office keeps
// the user where they are and offers a retry.
export const STAFF_SESSION_ERROR = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_INVALID: "SESSION_INVALID",
  SESSION_REVOKED: "SESSION_REVOKED",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  SESSION_CHECK_UNAVAILABLE: "SESSION_CHECK_UNAVAILABLE",
};

const REJECTION_MESSAGES = {
  AUTH_REQUIRED: "Authentication required",
  SESSION_EXPIRED: "Invalid or expired token",
  SESSION_INVALID: "Invalid or expired token",
  SESSION_REVOKED: "Session has been revoked",
  ACCOUNT_INACTIVE: "Account is not active",
};

class StaffSessionRejected extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const JWT_ERROR_NAMES = new Set(["JsonWebTokenError", "NotBeforeError"]);

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
}

// Identifies a token for revocation: its jti, or (for tokens issued before
// jti existed) a SHA-256 of the token itself, so legacy sessions can still be
// logged out individually.
export function staffTokenId(token, payload) {
  return payload?.jti || crypto.createHash("sha256").update(token).digest("hex");
}

function verifyStaffToken(token) {
  try {
    return verifyAccessToken(token);
  } catch (error) {
    if (error?.name === "TokenExpiredError") throw new StaffSessionRejected(STAFF_SESSION_ERROR.SESSION_EXPIRED);
    if (JWT_ERROR_NAMES.has(error?.name)) throw new StaffSessionRejected(STAFF_SESSION_ERROR.SESSION_INVALID);
    // e.g. JWT_SECRET missing: a server fault, not proof the session is bad.
    throw error;
  }
}

const baseSelect = {
  id: true, employeeNo: true, fullName: true, email: true, phone: true,
  role: true, status: true, branchId: true, createdAt: true, updatedAt: true,
};

async function loadUser(userId) {
  try {
    return await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...baseSelect,
        sessionVersion: true,
        organizationId: true,
        organization: { select: { id: true, slug: true, name: true, active: true } },
      },
    });
  } catch (error) {
    // Temporary rolling-migration compatibility for the existing
    // single-agency Production database. P2021/P2022 means the new table
    // or column is not present yet; other database failures must still
    // fail closed (as 503 — see requireAuth).
    if (!["P2021", "P2022"].includes(error?.code)) throw error;
    const legacyUser = await prisma.user.findUnique({ where: { id: userId }, select: baseSelect });
    return legacyUser ? {
      ...legacyUser,
      sessionVersion: 0,
      organizationId: "org_nasaem_default",
      organization: { id: "org_nasaem_default", slug: "nasaem-al-haramain", name: "نسائم الحرمين", active: true },
      legacySchema: true,
    } : null;
  }
}

async function resolveStaffSession(token) {
  const payload = verifyStaffToken(token);
  const userId = payload.sub || payload.id;
  if (!userId || payload.scope) throw new StaffSessionRejected(STAFF_SESSION_ERROR.SESSION_INVALID);

  const user = await loadUser(userId);
  if (!user || user.status !== "ACTIVE" || !user.organization.active) {
    throw new StaffSessionRejected(STAFF_SESSION_ERROR.ACCOUNT_INACTIVE);
  }
  // Tokens issued before sessionVersion existed carry no `sv` and count as 0.
  if ((payload.sv ?? 0) !== (user.sessionVersion ?? 0)) {
    throw new StaffSessionRejected(STAFF_SESSION_ERROR.SESSION_REVOKED);
  }

  const tokenId = staffTokenId(token, payload);
  if (!user.legacySchema) {
    const revoked = await prisma.revokedStaffToken.findUnique({ where: { tokenId }, select: { tokenId: true } });
    if (revoked) throw new StaffSessionRejected(STAFF_SESSION_ERROR.SESSION_REVOKED);
  }

  const { sessionVersion, legacySchema, ...safeUser } = user;
  return { user: safeUser, session: { tokenId, exp: payload.exp, sessionVersion } };
}

export async function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ success: false, message: REJECTION_MESSAGES.AUTH_REQUIRED, code: STAFF_SESSION_ERROR.AUTH_REQUIRED });
  }

  let resolved;
  try {
    resolved = await resolveStaffSession(token);
  } catch (error) {
    if (error instanceof StaffSessionRejected) {
      return res.status(401).json({ success: false, message: REJECTION_MESSAGES[error.code], code: error.code });
    }
    console.error("[auth] staff session check failed", error);
    return res.status(503).json({
      success: false,
      message: "تعذر التحقق من الجلسة حاليًا، حاول مرة أخرى بعد قليل",
      code: STAFF_SESSION_ERROR.SESSION_CHECK_UNAVAILABLE,
    });
  }

  req.user = resolved.user;
  req.organization = resolved.user.organization;
  req.staffSession = resolved.session;
  return next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: STAFF_SESSION_ERROR.AUTH_REQUIRED,
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    next();
  };
}
