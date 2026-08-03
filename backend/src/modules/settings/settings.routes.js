import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { getSettings, storeSetting } from "./settings.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getSettings);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeSetting);

export default router;
