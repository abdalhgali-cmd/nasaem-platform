import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getPaymentSettings, getSettings, storeSetting } from "./settings.controller.js";

const router = Router();

// Public: the marketing site's Umrah request form reads the exchange rate
// and bank account numbers before the customer has any staff session.
router.get("/payment-info", getPaymentSettings);

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getSettings);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeSetting);

export default router;
