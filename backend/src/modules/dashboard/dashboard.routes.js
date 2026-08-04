import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getDashboard } from "./dashboard.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/stats", requireRole("SUPER_ADMIN", "ADMIN"), getDashboard);

export default router;
