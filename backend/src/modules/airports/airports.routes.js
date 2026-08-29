import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { destroyAirport, getAirports, getSearch, patchAirport, storeAirport } from "./airports.controller.js";

const router = Router();

// Public: flight-search typeahead needs this with no staff session
// available (same posture as GET /api/airlines/public).
router.get("/search", getSearch);

router.use(requireAuth);

// Platform 3.0 Phase 15: CONTENT_MANAGER added — this directory is
// content configuration, never financial or operational.
router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"), getAirports);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), storeAirport);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), patchAirport);
router.delete("/:id", requireRole("SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"), destroyAirport);

export default router;
