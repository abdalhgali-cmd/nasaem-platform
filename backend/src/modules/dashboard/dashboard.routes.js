import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { getDashboard } from "./dashboard.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/stats", requireRole("SUPER_ADMIN", "ADMIN"), getDashboard);

export default router;
