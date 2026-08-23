import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { destroyAirport, getAirports, getSearch, patchAirport, storeAirport } from "./airports.controller.js";

const router = Router();

// Public: flight-search typeahead needs this with no staff session
// available (same posture as GET /api/airlines/public).
router.get("/search", getSearch);

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getAirports);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN"), storeAirport);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), patchAirport);
router.delete("/:id", requireRole("SUPER_ADMIN", "ADMIN"), destroyAirport);

export default router;
