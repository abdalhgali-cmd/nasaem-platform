import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getReport } from "./finance.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/reports", requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"), getReport);

export default router;
