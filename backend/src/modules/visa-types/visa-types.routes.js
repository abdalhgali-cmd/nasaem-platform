import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getVisaType,
  getVisaTypes,
  patchReorder,
  patchVisaType,
  removeVisaType,
  storeVisaType,
} from "./visa-types.controller.js";

const router = Router();

// No public endpoint here — the public catalog already exposes active
// visa types via GET /api/services/public (services.service.js's
// listPublicCatalog), so this module stays admin-only CRUD.
router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getVisaTypes);
// Registered before /:id so "reorder" is never swallowed as an id param.
router.patch("/reorder", requireRole("SUPER_ADMIN", "ADMIN"), patchReorder);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getVisaType);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeVisaType);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchVisaType);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeVisaType);

export default router;
