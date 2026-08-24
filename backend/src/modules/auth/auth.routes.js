import { Router } from "express";
import rateLimit from "express-rate-limit";

import { changeMyPassword, login, logout, me } from "./auth.controller.js";
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

// Same rationale as loginLimiter — this endpoint also checks a
// user-supplied password against the stored hash, so it's an equivalent
// brute-force surface even though the caller is already authenticated.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

router.post("/login", loginLimiter, login);
router.post("/logout", requireAuth, logout);
router.post("/change-password", requireAuth, changePasswordLimiter, changeMyPassword);
router.get("/me", requireAuth, me);

export default router;
