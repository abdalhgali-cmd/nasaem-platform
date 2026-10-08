import { verifyTrackingToken } from "../../utils/jwt.js";

// Same Bearer-header fallback as customer-auth.middleware.js's
// extractCustomerToken, and for the same reason: the mobile app stores this
// token itself (Capacitor Preferences) rather than depending on the
// cross-origin cookie surviving an app restart.
function extractTrackingToken(req) {
  if (req.cookies?.trackingAccessToken) return req.cookies.trackingAccessToken;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export function requireTrackingAuth(req, res, next) {
  try {
    const token = extractTrackingToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const payload = verifyTrackingToken(token);

    req.trackingPhone = payload.sub;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
}
