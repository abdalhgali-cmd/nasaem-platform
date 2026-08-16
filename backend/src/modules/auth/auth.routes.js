import { Router } from "express";
import rateLimit from "express-rate-limit";

import { confirmPasswordReset, login, logout, me, requestPasswordReset } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

const router = Router();

// Stricter than the app-wide limiter (app.js) to slow down credential
// stuffing / brute-force attempts against employee accounts specifically.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

// Same 5-and-10 shape as customer-auth.routes.js's requestCodeLimiter/
// verifyCodeLimiter, and the same reasoning: the real brute-force defense
// is the DB-backed `attempts` cap on StaffPasswordResetCode, not this — this
// is just a coarse per-IP deterrent.
const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

const passwordResetConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

router.post("/login", loginLimiter, login);
router.post("/password-reset/request", passwordResetRequestLimiter, requestPasswordReset);
router.post("/password-reset/confirm", passwordResetConfirmLimiter, confirmPasswordReset);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

export default router;
