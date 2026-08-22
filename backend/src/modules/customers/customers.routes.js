import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { getCustomer, getCustomerLookup, getCustomers, patchCustomer, storeCustomer } from "./customers.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomers);
router.get("/lookup", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomerLookup);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomer);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), storeCustomer);
router.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), patchCustomer);

export default router;
