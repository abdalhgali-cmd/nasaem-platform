import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { requireContactRequestOrganization } from "../../middleware/organization.middleware.js";
import { attachOptionalCustomer } from "../customer-auth/customer-auth.middleware.js";
import { requireFeatureEnabled } from "../feature-flags/feature-flags.middleware.js";
import {
  uploadContactRequestDeliverable,
  uploadContactRequestIntakeDocuments,
} from "../../middleware/upload.middleware.js";
import {
  confirmPayment,
  downloadDeliverableFile,
  downloadDocumentFile,
  getContactRequests,
  patchContactRequestAssignment,
  patchContactRequestStatus,
  previewPricing,
  reviewDocument,
  storeContactRequest,
  storeDeliverable,
  storeInvoice,
  storeInvoiceFromPricing,
  storeOffer,
  storeOfferFromPricing,
} from "./contact-requests.controller.js";
import {
  getProviderPackage,
  getProviderSubmissions,
  patchProviderSubmission,
  storeProviderSubmission,
} from "../provider-submissions/provider-submissions.controller.js";

const router = Router();

function handleDeliverableUpload(req, res, next) {
  uploadContactRequestDeliverable(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "File upload failed",
      });
    }

    next();
  });
}

function handleIntakeDocumentsUpload(req, res, next) {
  uploadContactRequestIntakeDocuments(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "File upload failed",
      });
    }

    next();
  });
}

const publicContactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

router.post("/", publicContactLimiter, attachOptionalCustomer, handleIntakeDocumentsUpload, storeContactRequest);

router.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequests
);
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  patchContactRequestStatus
);
// Smart Case Operations — Release C groundwork. Assignment is a manager
// action (SUPER_ADMIN/ADMIN) — an EMPLOYEE can see and work their own
// assigned cases (via GET /?assignedUserId=mine) but can't reassign work,
// matching the spec's "Managers can assign/reassign" rule.
router.patch(
  "/:id/assign",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  requireContactRequestOrganization,
  patchContactRequestAssignment
);
router.post(
  "/:id/pricing-preview",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  requireContactRequestOrganization,
  requireFeatureEnabled("QUOTES"),
  previewPricing
);
router.post(
  "/:id/pricing-invoice",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  requireContactRequestOrganization,
  requireFeatureEnabled("QUOTES"),
  storeInvoiceFromPricing
);
router.post(
  "/:id/pricing-offer",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  requireContactRequestOrganization,
  requireFeatureEnabled("QUOTES"),
  storeOfferFromPricing
);
router.post(
  "/:id/invoice",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  storeInvoice
);
router.post(
  "/:id/offers",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  storeOffer
);
router.post(
  "/:id/confirm-payment",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"),
  requireContactRequestOrganization,
  requireFeatureEnabled("PAYMENTS"),
  confirmPayment
);
router.get(
  "/:id/documents/:documentId/file",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  requireContactRequestOrganization,
  downloadDocumentFile
);
router.patch(
  "/:id/documents/:documentId/status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  requireFeatureEnabled("STAFF_REVIEW"),
  reviewDocument
);
router.post(
  "/:id/deliverables",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  requireFeatureEnabled("DOCUMENTS"),
  handleDeliverableUpload,
  storeDeliverable
);
// Smart Case Operations — Release F (provider operations). Mounted on the
// case itself rather than a separate provider app: sending a case out is
// part of working that case. Restricted to the roles that already process
// cases — CONTENT_MANAGER/ACCOUNTANT never hand work to an external party.
router.get(
  "/:id/provider-package",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  getProviderPackage
);
router.get(
  "/:id/provider-submissions",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  getProviderSubmissions
);
router.post(
  "/:id/provider-submissions",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  storeProviderSubmission
);
router.patch(
  "/:id/provider-submissions/:submissionId",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  requireContactRequestOrganization,
  patchProviderSubmission
);
router.get(
  "/:id/deliverables/:deliverableId/file",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  requireContactRequestOrganization,
  downloadDeliverableFile
);

export default router;
