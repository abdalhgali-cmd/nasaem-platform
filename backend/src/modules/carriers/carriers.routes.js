import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getCarrier, getCarriers, patchCarrier, storeCarrier } from "./carriers.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCarriers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCarrier);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeCarrier);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchCarrier);

export default router;
