import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getAutoLinkReview, getCustomer, getCustomerLookup, getCustomers, patchCustomer, storeCustomer } from "./customers.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomers);
router.get("/lookup", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomerLookup);
// Read-only review list of past automatic links (managers only).
router.get("/review/auto-links", requireRole("SUPER_ADMIN", "ADMIN"), getAutoLinkReview);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomer);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), storeCustomer);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), patchCustomer);

export default router;
