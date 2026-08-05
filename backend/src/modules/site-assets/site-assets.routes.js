import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadSiteAsset as uploadSiteAssetMiddleware } from "../../middleware/upload.middleware.js";
import { getSiteAssetFile, getSiteAssets, uploadSiteAsset } from "./site-assets.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadSiteAssetMiddleware(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "File upload failed",
      });
    }

    next();
  });
}

// Public: the marketing site's own pages fetch these directly, with no
// staff session available. Nothing sensitive here — key/fileName/mimeType/
// updatedAt for whichever assets are set, and the file bytes themselves are
// already served publicly by the route below regardless.
router.get("/:key/file", getSiteAssetFile);
router.get("/", getSiteAssets);
router.post(
  "/:key",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  handleUpload,
  uploadSiteAsset
);

export default router;
