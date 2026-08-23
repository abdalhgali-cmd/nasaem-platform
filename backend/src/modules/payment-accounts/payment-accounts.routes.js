import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getActivePaymentAccounts,
  getPaymentAccounts,
  patchPaymentAccount,
  postPaymentAccount,
} from "./payment-accounts.controller.js";

const router = Router();

// Customers only need active accounts and this endpoint is safe behind the
// authenticated tracking session. Staff get the management endpoints below.
router.get("/active", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getActivePaymentAccounts);
router.get("/", requireAuth, requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getPaymentAccounts);
router.post("/", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), postPaymentAccount);
router.patch("/:id", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), patchPaymentAccount);

export default router;
