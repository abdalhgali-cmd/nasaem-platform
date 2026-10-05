import { Router } from "express";
import rateLimit from "express-rate-limit";

import { changePassword, login, logout, me } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

const router = Router();

const envLimit = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Stricter than the app-wide limiter (app.js) to slow down credential
// stuffing / brute-force attempts against employee accounts specifically.
// LOGIN_IP_LIMIT exists only so test suites that log in many times from one IP
// can relax it.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit("LOGIN_IP_LIMIT", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

// Per-ACCOUNT throttle on top of the per-IP one: an attacker rotating IPs
// (botnet, proxies) is still limited to 10 FAILED attempts per account per 15
// minutes. Successful logins are not counted. (Trade-off: someone can briefly
// lock a known account out by failing deliberately; the window is 15 minutes.)
const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `acct:${String(req.body?.email ?? "").trim().toLowerCase() || "unknown"}`,
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    message: "Too many failed attempts for this account. Please try again later.",
  },
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

router.post("/login", loginLimiter, accountLoginLimiter, login);
router.post("/change-password", requireAuth, passwordChangeLimiter, changePassword);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

export default router;
