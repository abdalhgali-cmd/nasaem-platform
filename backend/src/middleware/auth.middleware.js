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

    // Defense-in-depth: a customer token (see customerAuth.middleware.js)
    // already has no `sub`/`id` and would fail the check below anyway, but
    // reject its shape explicitly rather than relying on that as the only
    // boundary.
    if (payload.type === "customer") {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    const userId = payload.sub || payload.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        success: false,
        message: "Account is not active",
      });
    }

    req.user = user;
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
