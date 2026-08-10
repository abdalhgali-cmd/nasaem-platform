import { verifyAccessToken } from "../utils/jwt.js";

// Reads only the customer cookie — never the Authorization header, and
// never accepts req.cookies.accessToken. The web app is the only client and
// always sends the cookie, so skipping the Bearer-header fallback that
// requireAuth supports closes off a whole class of cross-token replay
// concerns for free.
export function requireCustomerAuth(req, res, next) {
  try {
    const token = req.cookies?.customerAccessToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const payload = verifyAccessToken(token);

    if (payload.type !== "customer" || !payload.phone) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    req.customerPhone = payload.phone;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}
