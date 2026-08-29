import prisma from "../config/database.js";
import { verifyAccessToken } from "../utils/jwt.js";

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

export async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const payload = verifyAccessToken(token);
    const userId = payload.sub || payload.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const baseSelect = {
      id: true, employeeNo: true, fullName: true, email: true, phone: true,
      role: true, status: true, branchId: true, createdAt: true, updatedAt: true,
    };
    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          ...baseSelect,
          organizationId: true,
          organization: { select: { id: true, slug: true, name: true, active: true } },
        },
      });
    } catch (error) {
      // Temporary rolling-migration compatibility for the existing
      // single-agency Production database. P2021/P2022 means the new table
      // or column is not present yet; other database failures must still
      // fail closed.
      if (!['P2021', 'P2022'].includes(error?.code)) throw error;
      const legacyUser = await prisma.user.findUnique({ where: { id: userId }, select: baseSelect });
      user = legacyUser ? {
        ...legacyUser,
        organizationId: 'org_nasaem_default',
        organization: { id: 'org_nasaem_default', slug: 'nasaem-al-haramain', name: 'نسائم الحرمين', active: true },
      } : null;
    }

    if (!user || user.status !== "ACTIVE" || !user.organization.active) {
      return res.status(401).json({
        success: false,
        message: "Account is not active",
      });
    }

    req.user = user;
    req.organization = user.organization;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
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

