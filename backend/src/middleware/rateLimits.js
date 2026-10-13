import rateLimit from "express-rate-limit";
import { verifyAccessToken } from "../utils/jwt.js";

const WINDOW_MS = 15 * 60 * 1000;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Identifies the caller of an /api request for rate limiting.
// Staff (and signed-in customers) often share one office or mobile-carrier
// IP: keying them by IP made a handful of colleagues exhaust one shared
// budget. A request carrying a *valid* signed session token is therefore
// keyed by its subject; everything else by client IP (trust proxy is set in
// app.js, so req.ip is the real client behind Railway's proxy). Forged or
// expired tokens fail verification and fall back to the IP key, so they
// cannot be used to escape the anonymous limit.
function sessionSubject(req) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.accessToken || req.cookies?.customerAccessToken;
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

export function createApiRateLimiter({
  anonymousLimit = positiveInt(process.env.API_RATE_LIMIT, 200),
  sessionLimit = positiveInt(process.env.API_SESSION_RATE_LIMIT, 1500),
} = {}) {
  return rateLimit({
    windowMs: WINDOW_MS,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const subject = sessionSubject(req);
      req.rateLimitSubject = subject;
      return subject ? `session:${subject}` : `ip:${req.ip}`;
    },
    limit: (req) => (req.rateLimitSubject ? Math.max(sessionLimit, anonymousLimit) : anonymousLimit),
    message: { success: false, message: "عدد كبير من الطلبات. انتظر قليلًا ثم أعد المحاولة.", code: "RATE_LIMITED" },
  });
}

// Staff login throttling. Successful logins are not counted (a whole
// office signing in each morning from one IP is normal); failed attempts
// are limited per account+IP (stops guessing one account's password) and,
// more loosely, per IP (stops spraying many accounts from one place).
export function createLoginLimiters({ perAccount = 10, perIp = positiveInt(process.env.LOGIN_IP_FAILURE_LIMIT, 50) } = {}) {
  const message = { success: false, message: "محاولات دخول فاشلة كثيرة. حاول مرة أخرى بعد 15 دقيقة.", code: "LOGIN_RATE_LIMITED" };
  const accountKey = (req) => `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}`;
  return [
    rateLimit({ windowMs: WINDOW_MS, limit: perIp, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message }),
    rateLimit({ windowMs: WINDOW_MS, limit: perAccount, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, keyGenerator: accountKey, message }),
  ];
}
