import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getUser, getUsers, storeUser, updateRole, updateStatus } from "./users.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getUsers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN"), getUser);
router.post("/", requireRole("SUPER_ADMIN"), storeUser);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "ADMIN"), updateStatus);
router.patch("/:id/role", requireRole("SUPER_ADMIN"), updateRole);

export default router;
