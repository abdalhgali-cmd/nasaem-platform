import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  uploadSiteAsset as uploadSiteAssetMiddleware,
  uploadSiteMotionAsset as uploadSiteMotionAssetMiddleware,
} from "../../middleware/upload.middleware.js";
import {
  getPublicCatalog,
  getPublicPackages,
  getService,
  getServices,
  patchReorder,
  patchService,
  removeService,
  storeService,
  uploadServiceHeroImage,
  uploadServiceHeroImageMobile,
  uploadServiceImage,
  uploadServiceMotionVideo,
} from "./services.controller.js";
import { makeRequirementsController } from "../requirements/requirements.controller.js";

const router = Router();

// Requirements checklist (Platform 3.0 Phase 5, generalized to services in
// Phase 8 — Security Approvals is a Service, not a VisaType, but needs the
// exact same checklist engine as visa-types.routes.js uses).
const {
  getPublicRequirements,
  getRequirements,
  storeRequirement,
  patchRequirement,
  destroyRequirement,
} = makeRequirementsController({ paramName: "serviceId", scopeKey: "serviceId", entityLabel: "Service" });

function handleUpload(req, res, next) {
  uploadSiteAssetMiddleware(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

function handleMotionUpload(req, res, next) {
  uploadSiteMotionAssetMiddleware(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Public, unauthenticated — backs the web/ Service Intake wizard's service
// and visa-type pickers (Umrah/Visas/Packages). Must be registered before
// requireAuth below, which gates every other route in this module.
router.get("/public/packages", getPublicPackages);
router.get("/public", getPublicCatalog);
router.get("/:serviceId/requirements/public", getPublicRequirements);

router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added to the catalog-content
// routes (read/create/update/reorder/image/requirements) — never to
// DELETE /:id, which stays SUPER_ADMIN-only exactly as before.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getServices);
// Registered before /:id so "reorder" is never swallowed as an id param.
router.patch("/reorder", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchReorder);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getService);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeService);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchService);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeService);
router.post("/:id/image", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleUpload, uploadServiceImage);
router.post("/:id/hero-image", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleUpload, uploadServiceHeroImage);
router.post("/:id/hero-image-mobile", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleUpload, uploadServiceHeroImageMobile);
router.post("/:id/motion-video", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), handleMotionUpload, uploadServiceMotionVideo);

router.get("/:serviceId/requirements", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getRequirements);
router.post("/:serviceId/requirements", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeRequirement);
router.patch("/requirements/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchRequirement);
router.delete("/requirements/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroyRequirement);

export default router;
