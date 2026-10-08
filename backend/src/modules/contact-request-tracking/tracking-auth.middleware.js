import { verifyTrackingToken } from "../../utils/jwt.js";

export function requireTrackingAuth(req, res, next) {
  try {
    const authorization = req.headers?.authorization;
    const bearerToken =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : null;
    const token = bearerToken || req.cookies?.trackingAccessToken;

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
