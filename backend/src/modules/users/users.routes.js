import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { getUser, getUsers, storeUser, updateStatus } from "./users.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getUsers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN"), getUser);
router.post("/", requireRole("SUPER_ADMIN"), storeUser);
router.patch("/:id/status", requireRole("SUPER_ADMIN", "ADMIN"), updateStatus);

export default router;
