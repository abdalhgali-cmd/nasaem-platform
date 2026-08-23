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

// CONTENT_MANAGER is added to these role lists in Batch 5 once the role
// exists (see docs/PLATFORM-3-AUDIT.md) — SUPER_ADMIN/ADMIN already have
// full config access today.
router.get("/hero", requireRole("SUPER_ADMIN", "ADMIN"), getHero);
router.patch("/hero", requireRole("SUPER_ADMIN", "ADMIN"), patchHero);
router.get("/sections", requireRole("SUPER_ADMIN", "ADMIN"), getSections);
router.post("/sections", requireRole("SUPER_ADMIN", "ADMIN"), storeSection);
router.patch("/sections/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchSection);
router.delete("/sections/:id", requireRole("SUPER_ADMIN", "ADMIN"), destroySection);
router.post("/sections/:id/image", requireRole("SUPER_ADMIN", "ADMIN"), handleUpload, uploadSectionImage);

export default router;
