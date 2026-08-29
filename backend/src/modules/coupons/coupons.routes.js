import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { requireCustomerAuth } from "../customer-auth/customer-auth.middleware.js";
import {
  getCoupons,
  getCoupon,
  getCouponUsageHistory,
  storeCoupon,
  patchCoupon,
  activateCoupon,
  deactivateCoupon,
  archiveCoupon,
  validateCoupon,
} from "./coupons.controller.js";

const router = Router();

// Customer-facing preview — registered before the admin `requireAuth`
// gate below (own, separate auth: a Customer session, never a staff one).
router.post("/validate", requireCustomerAuth, validateCoupon);

// Everything else is admin-only coupon management. Never CUSTOMER: there
// is no code path here a Customer session could reach — requireAuth only
// accepts a staff User token, and requireRole further narrows it to
// SUPER_ADMIN/ADMIN, the same roles that manage offers/users elsewhere.
router.use(requireAuth, requireRole("SUPER_ADMIN", "ADMIN"));

router.get("/", getCoupons);
router.post("/", storeCoupon);
router.get("/:id", getCoupon);
router.patch("/:id", patchCoupon);
router.patch("/:id/activate", activateCoupon);
router.patch("/:id/deactivate", deactivateCoupon);
router.patch("/:id/archive", archiveCoupon);
router.get("/:id/usages", getCouponUsageHistory);

export default router;
