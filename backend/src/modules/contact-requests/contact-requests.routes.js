import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getContactRequests,
  patchContactRequestStatus,
  storeContactRequest,
} from "./contact-requests.controller.js";

const router = Router();

// This is the only public (unauthenticated) write endpoint in the API — the
// marketing site's contact form posts here directly from the browser.
// Tighter than the general API limiter (app.js) since it's an open target
// for spam with no auth gate in front of it.
const publicContactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

router.post("/", publicContactLimiter, storeContactRequest);

router.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequests
);
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  patchContactRequestStatus
);

export default router;
