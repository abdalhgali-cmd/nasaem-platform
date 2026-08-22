import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  uploadContactRequestDeliverable,
  uploadContactRequestIntakeDocuments,
} from "../../middleware/upload.middleware.js";
import {
  confirmPayment,
  downloadDeliverableFile,
  downloadDocumentFile,
  getContactRequests,
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

router.post("/", publicContactLimiter, handleIntakeDocumentsUpload, storeContactRequest);

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
  patchContactRequestStatus
);
router.post(
  "/:id/pricing-preview",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  previewPricing
);
router.post(
  "/:id/pricing-invoice",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  storeInvoiceFromPricing
);
router.post(
  "/:id/pricing-offer",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  storeOfferFromPricing
);
router.post(
  "/:id/invoice",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  storeInvoice
);
router.post(
  "/:id/offers",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  storeOffer
);
router.post(
  "/:id/confirm-payment",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "ACCOUNTANT"),
  confirmPayment
);
router.get(
  "/:id/documents/:documentId/file",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  downloadDocumentFile
);
router.patch(
  "/:id/documents/:documentId/status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  reviewDocument
);
router.post(
  "/:id/deliverables",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  handleDeliverableUpload,
  storeDeliverable
);
router.get(
  "/:id/deliverables/:deliverableId/file",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"),
  downloadDeliverableFile
);

export default router;
