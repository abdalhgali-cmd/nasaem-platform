import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getFlags, getPublic, patchFlag } from "./feature-flags.controller.js";

const router = Router();

// Public: lets the frontend hide a disabled feature's UI too — but this
// is never the enforcement itself, only a courtesy; every gated route
// re-checks server-side via requireFeatureEnabled regardless of what
// this endpoint says.
router.get("/public", getPublic);

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN"), getFlags);
router.patch("/:key", requireRole("SUPER_ADMIN", "ADMIN"), patchFlag);

export default router;
