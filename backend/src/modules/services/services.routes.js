import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { uploadSiteAsset as uploadSiteAssetMiddleware } from "../../middleware/upload.middleware.js";
import {
  getPublicCatalog,
  getService,
  getServices,
  patchReorder,
  patchService,
  removeService,
  storeService,
  uploadServiceImage,
} from "./services.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadSiteAssetMiddleware(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Public, unauthenticated — backs the web/ Service Intake wizard's service
// and visa-type pickers (Umrah/Visas/Packages). Must be registered before
// requireAuth below, which gates every other route in this module.
router.get("/public", getPublicCatalog);

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getServices);
// Registered before /:id so "reorder" is never swallowed as an id param.
router.patch("/reorder", requireRole("SUPER_ADMIN", "ADMIN"), patchReorder);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getService);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeService);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchService);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeService);
router.post("/:id/image", requireRole("SUPER_ADMIN", "ADMIN"), handleUpload, uploadServiceImage);

export default router;
