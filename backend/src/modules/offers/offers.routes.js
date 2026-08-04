import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getOffer, getOffers, storeOffer } from "./offers.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getOffers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getOffer);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeOffer);

export default router;
