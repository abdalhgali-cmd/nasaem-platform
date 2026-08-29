import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  register,
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

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", requireCustomerAuth, logout);
router.post("/forgot-password", resetLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);

router.get("/me", requireCustomerAuth, me);
router.patch("/profile", requireCustomerAuth, updateProfile);
router.post("/change-password", requireCustomerAuth, changePassword);

export default router;
