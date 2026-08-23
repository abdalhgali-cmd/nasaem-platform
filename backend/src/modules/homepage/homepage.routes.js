import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadSiteAsset as uploadSiteAssetMiddleware } from "../../middleware/upload.middleware.js";
import {
  destroySection,
  getHero,
  getPublic,
  getSections,
  patchHero,
  patchSection,
  storeSection,
  uploadSectionImage,
} from "./homepage.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadSiteAssetMiddleware(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Public: the marketing homepage fetches this with no staff session
// available (same posture as GET /api/site-assets).
router.get("/public", getPublic);

router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added — this is content
// configuration, never financial or operational.
router.get("/hero", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), getHero);
router.patch("/hero", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchHero);
router.get("/sections", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), getSections);
router.post("/sections", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeSection);
router.patch("/sections/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchSection);
router.delete("/sections/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroySection);
router.post("/sections/:id/image", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleUpload, uploadSectionImage);

export default router;
