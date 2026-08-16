import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireTrackingAuth } from "./tracking-auth.middleware.js";
import { uploadContactRequestDocument } from "../../middleware/upload.middleware.js";
import {
  approveMyInvoice,
  downloadMyDocumentFile,
  getMyRequests,
  logout,
  markMyTransferSent,
  rejectMyInvoice,
  requestCode,
  selectMyOffer,
  uploadDocument,
  verifyCode,
} from "./contact-request-tracking.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadContactRequestDocument(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "File upload failed",
      });
    }

    next();
  });
}

// Public, unauthenticated endpoints — tighter than the general API limiter
// (app.js) since both are open targets (SMS/WhatsApp-bombing a phone
// number, brute-forcing a 6-digit code) with no auth gate in front of them.
const requestCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

router.post("/request-code", requestCodeLimiter, requestCode);
router.post("/verify-code", verifyCodeLimiter, verifyCode);
router.get("/requests", requireTrackingAuth, getMyRequests);
router.post("/requests/:id/invoice/approve", requireTrackingAuth, approveMyInvoice);
router.post("/requests/:id/invoice/reject", requireTrackingAuth, rejectMyInvoice);
router.post("/requests/:id/offers/:offerId/select", requireTrackingAuth, selectMyOffer);
router.post("/requests/:id/mark-transfer-sent", requireTrackingAuth, markMyTransferSent);
router.post(
  "/requests/:id/documents",
  requireTrackingAuth,
  handleUpload,
  uploadDocument
);
router.get(
  "/requests/:id/documents/:documentId/file",
  requireTrackingAuth,
  downloadMyDocumentFile
);
router.post("/logout", requireTrackingAuth, logout);

export default router;
