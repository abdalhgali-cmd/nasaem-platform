import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireTrackingAuth } from "./tracking-auth.middleware.js";
import {
  getMyRequests,
  logout,
  requestCode,
  verifyCode,
} from "./contact-request-tracking.controller.js";

const router = Router();

// Public, unauthenticated endpoints — tighter than the general API limiter
// (app.js) since both are open targets (SMS/WhatsApp-bombing a phone
// number, brute-forcing a 6-digit code) with no auth gate in front of them.
const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

router.post("/request-code", requestCodeLimiter, requestCode);
router.post("/verify-code", verifyCodeLimiter, verifyCode);
router.get("/requests", requireTrackingAuth, getMyRequests);
router.post("/logout", requireTrackingAuth, logout);

export default router;
