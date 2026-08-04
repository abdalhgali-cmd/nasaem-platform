import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { changeOrderStatus, getOrder, getOrders, storeOrder } from "./orders.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getOrders);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getOrder);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), storeOrder);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), changeOrderStatus);

export default router;
