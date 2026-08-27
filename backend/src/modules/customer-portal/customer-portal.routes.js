import { Router } from "express";

import { requireCustomerAuth } from "../customer-auth/customer-auth.middleware.js";
import { requireFeatureEnabled } from "../feature-flags/feature-flags.middleware.js";
import { uploadContactRequestDocument } from "../../middleware/upload.middleware.js";
import { getOverview, getOrders, getOrder, getRequests, getRequest, uploadRequestDocument, downloadRequestDeliverable, getNotifications, readNotification, getDocuments, getCoupons, storeSelfOrder } from "./customer-portal.controller.js";

const router = Router();

// Every route here requires a Customer session — never a staff User
// session (a different cookie, a different JWT scope; see
// customer-auth.middleware.js) — so this module is structurally
// unreachable by ADMIN/SUPER_ADMIN/staff tokens and vice versa.
router.use(requireCustomerAuth);

router.get("/overview", getOverview);
router.get("/orders", getOrders);
router.get("/orders/:id", getOrder);
router.get("/requests", getRequests);
router.get("/requests/:id", getRequest);
router.post("/requests/:id/documents", requireFeatureEnabled("CUSTOMER_UPLOAD"), uploadContactRequestDocument, uploadRequestDocument);
router.get("/requests/:id/deliverables/:deliverableId/file", downloadRequestDeliverable);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", readNotification);
router.post("/orders", storeSelfOrder);
router.get("/documents", getDocuments);
router.get("/coupons", getCoupons);

export default router;
