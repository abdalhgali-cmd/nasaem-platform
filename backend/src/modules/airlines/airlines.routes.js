import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadSiteAsset as uploadSiteAssetMiddleware } from "../../middleware/upload.middleware.js";
import {
  destroyAirline,
  getAirlines,
  getPublic,
  patchAirline,
  storeAirline,
  uploadAirlineLogo,
} from "./airlines.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadSiteAssetMiddleware(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Public: a reference directory, safe to expose unauthenticated (same
// posture as GET /api/ferries/public) for any future public consumer
// (e.g. Phase 12's flight search results).
router.get("/public", getPublic);

router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added — this directory is
// content configuration, never financial or operational.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getAirlines);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeAirline);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchAirline);
router.delete("/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroyAirline);
router.post("/:id/logo", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleUpload, uploadAirlineLogo);

export default router;
