import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  destroyRequirement,
  getPublicRequirements,
  getRequirements,
  getVisaType,
  getVisaTypes,
  patchReorder,
  patchRequirement,
  patchVisaType,
  removeVisaType,
  storeRequirement,
  storeVisaType,
} from "./visa-types.controller.js";

const router = Router();

// Public: the Service Intake wizard fetches the active checklist for the
// visa type a customer just selected, with no staff session available
// (same posture as GET /api/services/public).
router.get("/:visaTypeId/requirements/public", getPublicRequirements);

// No public endpoint for the visa type itself — the public catalog
// already exposes active visa types via GET /api/services/public
// (services.service.js's listPublicCatalog), so this module stays
// admin-only CRUD beyond the requirements checklist above.
router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added to the catalog-content
// routes — never to DELETE /:id, which stays SUPER_ADMIN-only exactly
// as before.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getVisaTypes);
// Registered before /:id so "reorder" is never swallowed as an id param.
router.patch("/reorder", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchReorder);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getVisaType);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeVisaType);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchVisaType);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeVisaType);

// Requirements checklist (Platform 3.0 Phase 5) — nested under the parent
// visa type for listing/creation, flat for individual mutation, same
// shape as homepage sections.
router.get("/:visaTypeId/requirements", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getRequirements);
router.post("/:visaTypeId/requirements", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeRequirement);
router.patch("/requirements/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchRequirement);
router.delete("/requirements/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroyRequirement);

export default router;
