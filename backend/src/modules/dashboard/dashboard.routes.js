import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getDashboard, getOperations, getSummary } from "./dashboard.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/stats", requireRole("SUPER_ADMIN", "ADMIN"), getDashboard);
router.get("/summary", requireRole("SUPER_ADMIN", "ADMIN"), getSummary);
router.get("/operations", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getOperations);

export default router;
