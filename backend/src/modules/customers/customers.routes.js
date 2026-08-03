import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { getCustomer, getCustomers, storeCustomer } from "./customers.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomers);
router.get("/:id", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"), getCustomer);
router.post("/", requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"), storeCustomer);

export default router;
