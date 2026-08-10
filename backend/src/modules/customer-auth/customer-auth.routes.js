import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireCustomerAuth } from "../../middleware/customerAuth.middleware.js";
import { logout, me, requestCode, verifyCode } from "./customer-auth.controller.js";

const router = Router();

// Matches publicContactLimiter's convention (contact-requests.routes.js) —
// the real brute-force defense for verify-code is the DB-backed `attempts`
// cap on CustomerLoginCode (see customer-auth.service.js), not this; this
// is just a coarse per-IP deterrent that survives restarts less well than
// the DB check.
const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

router.post("/request-code", requestCodeLimiter, requestCode);
router.post("/verify-code", verifyCodeLimiter, verifyCode);
router.get("/me", requireCustomerAuth, me);
router.post("/logout", logout);

export default router;
