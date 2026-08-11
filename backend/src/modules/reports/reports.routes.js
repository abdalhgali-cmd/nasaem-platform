import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getReportsSummaryHandler } from "./reports.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/summary", requireRole("SUPER_ADMIN", "ADMIN"), getReportsSummaryHandler);

export default router;
