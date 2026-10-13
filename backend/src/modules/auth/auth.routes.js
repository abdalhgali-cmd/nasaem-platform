import { Router } from "express";
import { createLoginLimiters } from "../../middleware/rateLimits.js";

import { changePassword, login, logout, me } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";

const router = Router();

// Failed attempts only, per account+IP and per IP; see
// middleware/rateLimits.js. Successful logins never lock an office out.
const loginLimiter = createLoginLimiters();

router.post("/login", ...loginLimiter, login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);
router.post("/change-password", requireAuth, ...createLoginLimiters({ perAccount: 10, perIp: 30 }), changePassword);

export default router;
