import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getUser, getUsers, storeUser, updateRole, resetPassword, updateStatus } from "./users.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getUsers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN"), getUser);
router.post("/", requireRole("SUPER_ADMIN"), storeUser);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "ADMIN"), updateStatus);
router.patch("/:id/role", requireRole("SUPER_ADMIN"), updateRole);
// SUPER_ADMIN resets anyone; an ADMIN resets ordinary staff only (enforced in the service).
router.post("/:id/reset-password", requireRole("SUPER_ADMIN", "ADMIN"), resetPassword);

export default router;
