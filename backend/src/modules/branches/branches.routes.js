import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getBranch, getBranches, patchBranch, storeBranch } from "./branches.controller.js";

const router = Router();

router.use(requireAuth);

// EMPLOYEE gets read-only access — orders.routes.js already lets EMPLOYEE
// create an order with a branchId, so they need a way to see valid
// branches to pick from.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), getBranches);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), getBranch);
router.post("/", requireRole("SUPER_ADMIN"), storeBranch);
router.patch("/:id", requireRole("SUPER_ADMIN"), patchBranch);

export default router;
