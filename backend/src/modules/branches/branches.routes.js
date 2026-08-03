import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { getBranch, getBranches, storeBranch } from "./branches.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getBranches);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN"), getBranch);
router.post("/", requireRole("SUPER_ADMIN"), storeBranch);

export default router;
