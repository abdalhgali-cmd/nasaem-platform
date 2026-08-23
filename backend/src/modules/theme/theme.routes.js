import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getPublic, getTheme, patchTheme } from "./theme.controller.js";

const router = Router();

// Public: the marketing site injects theme colors with no staff session
// available (same posture as GET /api/homepage/public).
router.get("/public", getPublic);

router.use(requireAuth);

// CONTENT_MANAGER is added to these role lists in Batch 5 once the role
// exists (see docs/PLATFORM-3-AUDIT.md) — SUPER_ADMIN/ADMIN already have
// full config access today.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getTheme);
router.patch("/", requireRole("SUPER_ADMIN", "ADMIN"), patchTheme);

export default router;
