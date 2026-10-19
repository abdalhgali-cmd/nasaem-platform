import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { listProviderStatuses } from "./provider-registry.js";

const router = Router();

// Readiness view for admins (issue #109 / #97): which providers could book
// directly and why not. Never returns URLs or credentials.
router.get("/status", requireAuth, requireRole("SUPER_ADMIN", "ADMIN"), (req, res) => {
  res.json({ success: true, data: listProviderStatuses() });
});

export default router;
