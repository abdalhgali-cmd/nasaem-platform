import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
  requestRegistrationCodeHandler,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} from "./customer-auth.controller.js";
import { requireCustomerAuth } from "./customer-auth.middleware.js";

const router = Router();

// Same posture as auth.routes.js's loginLimiter / tracking's request-code
// limiter: sensitive, credential-adjacent endpoints get a tighter limit
// than the app-wide one (app.js).
// CUSTOMER_AUTH_RATE_LIMIT / CUSTOMER_CODE_REQUEST_LIMIT exist only so test
// suites that exercise many auth calls in one process can relax them.
const envLimit = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit("CUSTOMER_AUTH_RATE_LIMIT", 10),
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

// Per-IP cap on top of the per-phone throttle enforced in the service.
const codeRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit("CUSTOMER_CODE_REQUEST_LIMIT", 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة جدًا، يرجى المحاولة لاحقًا" },
});

router.post("/request-registration-code", codeRequestLimiter, requestRegistrationCodeHandler);
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", requireCustomerAuth, logout);
router.post("/forgot-password", resetLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);

router.get("/me", requireCustomerAuth, me);
router.patch("/profile", requireCustomerAuth, updateProfile);
router.post("/change-password", requireCustomerAuth, changePassword);

export default router;
