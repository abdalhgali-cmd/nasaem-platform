import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  login,
  logout,
  me,
  refreshSession,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} from "./customer-auth.controller.js";
import { requireCustomerAuth } from "./customer-auth.middleware.js";
import { googleChallenge, googleLogin } from "./google-auth.js";

const router = Router();

// Same posture as auth.routes.js's loginLimiter / tracking's request-code
// limiter: sensitive, credential-adjacent endpoints get a tighter limit
// than the app-wide one (app.js).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة جدًا، يرجى المحاولة لاحقًا" },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة جدًا، يرجى المحاولة لاحقًا" },
});

// Loading optional Google configuration must not consume password attempts.
const googleConfigLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة جدًا، يرجى المحاولة لاحقًا" } });
const googleLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة جدًا، يرجى المحاولة لاحقًا" } });

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.get("/google/challenge", googleConfigLimiter, googleChallenge);
router.post("/google", googleLoginLimiter, googleLogin);
router.post("/logout", requireCustomerAuth, logout);
router.post("/forgot-password", resetLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);

router.get("/me", requireCustomerAuth, me);
router.post("/refresh", requireCustomerAuth, refreshSession);
router.patch("/profile", requireCustomerAuth, updateProfile);
router.post("/change-password", requireCustomerAuth, changePassword);

export default router;
