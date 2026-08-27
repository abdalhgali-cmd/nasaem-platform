import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getPublicSettings, getSettings, storeSetting } from "./settings.controller.js";

const router = Router();

router.get("/public", getPublicSettings);

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getSettings);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeSetting);

export default router;
