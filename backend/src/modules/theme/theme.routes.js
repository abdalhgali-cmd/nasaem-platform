import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getPublic, getTheme, patchTheme } from "./theme.controller.js";

const router = Router();

// Public: the marketing site injects theme colors with no staff session
// available (same posture as GET /api/homepage/public).
router.get("/public", getPublic);

router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added — this is content
// configuration, never financial or operational.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), getTheme);
router.patch("/", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchTheme);

export default router;
