import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getPublicCatalog,
  getService,
  getServices,
  patchService,
  removeService,
  storeService,
} from "./services.controller.js";

const router = Router();

// Public, unauthenticated — backs the web/ Service Intake wizard's service
// and visa-type pickers (Umrah/Visas/Packages). Must be registered before
// requireAuth below, which gates every other route in this module.
router.get("/public", getPublicCatalog);

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getServices);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getService);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeService);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchService);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeService);

export default router;
