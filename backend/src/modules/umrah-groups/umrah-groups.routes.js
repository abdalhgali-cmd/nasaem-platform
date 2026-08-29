import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { destroyMember, getGroup, getGroups, patchGroup, patchMember, storeGroup, storeMember } from "./umrah-groups.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getGroups);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getGroup);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), storeGroup);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), patchGroup);
router.post("/:id/members", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), storeMember);
router.patch("/:id/members/:memberId", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), patchMember);
router.delete("/:id/members/:memberId", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), destroyMember);

export default router;
