import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getUser, getUsers, resetPassword, storeUser, updateDepartment, updatePhone, updateStatus } from "./users.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getUsers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN"), getUser);
router.post("/", requireRole("SUPER_ADMIN"), storeUser);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "ADMIN"), updateStatus);
router.patch("/:id/department", requireRole("SUPER_ADMIN", "ADMIN"), updateDepartment);
router.patch("/:id/phone", requireRole("SUPER_ADMIN", "ADMIN"), updatePhone);
// SUPER_ADMIN-only (matches account creation above) — resetting someone
// else's password is the most sensitive action this module exposes.
router.patch("/:id/password", requireRole("SUPER_ADMIN"), resetPassword);

export default router;
