import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { getSupplier, getSuppliers, storeSupplier } from "./suppliers.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getSuppliers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN"), getSupplier);
router.post("/", requireRole("SUPER_ADMIN"), storeSupplier);

export default router;
