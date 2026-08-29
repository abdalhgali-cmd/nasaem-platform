import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { confirmPaymentAction, getPayment, getPayments, rejectPaymentAction, storePayment } from "./payments.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getPayments);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getPayment);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), storePayment);
router.post("/:id/confirm", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), confirmPaymentAction);
router.post("/:id/reject", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), rejectPaymentAction);

export default router;
