import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  getService,
  getServices,
  patchService,
  removeService,
  storeService,
} from "./services.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getServices);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getService);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeService);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchService);
router.delete("/:id", requireRole("SUPER_ADMIN"), removeService);

export default router;
