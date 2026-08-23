import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadSiteAsset as uploadSiteAssetMiddleware } from "../../middleware/upload.middleware.js";
import {
  destroyOperator,
  destroySchedule,
  getOperators,
  getPublic,
  getSchedules,
  patchOperator,
  patchSchedule,
  storeOperator,
  storeSchedule,
  uploadOperatorLogo,
} from "./ferries.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadSiteAssetMiddleware(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Public: the ferry booking intake form fetches this with no staff
// session available (same posture as GET /api/homepage/public) so its
// route/operator pickers reflect what an admin actually configured
// instead of hardcoded <select> options.
router.get("/public", getPublic);

router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added — this directory is
// content configuration, never financial or operational.
router.get("/operators", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getOperators);
router.post("/operators", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeOperator);
router.patch("/operators/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchOperator);
router.delete("/operators/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroyOperator);
router.post("/operators/:id/logo", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleUpload, uploadOperatorLogo);

router.get("/schedules", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getSchedules);
router.post("/operators/:operatorId/schedules", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeSchedule);
router.patch("/schedules/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchSchedule);
router.delete("/schedules/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroySchedule);

export default router;
