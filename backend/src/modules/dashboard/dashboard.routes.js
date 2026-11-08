import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getDashboard, getOperations, getSummary, getUmrahReportController } from "./dashboard.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/stats", requireRole("SUPER_ADMIN", "ADMIN"), getDashboard);
router.get("/summary", requireRole("SUPER_ADMIN", "ADMIN"), getSummary);
router.get("/umrah-report", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getUmrahReportController);
router.get("/operations", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getOperations);

export default router;
