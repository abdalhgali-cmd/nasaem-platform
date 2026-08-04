import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getPayment, getPayments, storePayment } from "./payments.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getPayments);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getPayment);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), storePayment);

export default router;
