import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireTrackingAuth } from "./tracking-auth.middleware.js";
import { uploadContactRequestDocument } from "../../middleware/upload.middleware.js";
import {
  approveMyInvoice,
  downloadMyDeliverableFile,
  downloadMyDocumentFile,
  getMyPaymentAccounts,
  getMyRequests,
  logout,
  markMyTransferSent,
  rejectMyInvoice,
  requestCode,
  selectMyOffer,
  uploadDocument,
  uploadPaymentReceipt,
  verifyCode,
} from "./contact-request-tracking.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadContactRequestDocument(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

const requestCodeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please try again later." } });
const verifyCodeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please try again later." } });

router.post("/request-code", requestCodeLimiter, requestCode);
router.post("/verify-code", verifyCodeLimiter, verifyCode);
router.get("/requests", requireTrackingAuth, getMyRequests);
router.get("/payment-accounts", requireTrackingAuth, getMyPaymentAccounts);
router.post("/requests/:id/invoice/approve", requireTrackingAuth, approveMyInvoice);
router.post("/requests/:id/invoice/reject", requireTrackingAuth, rejectMyInvoice);
router.post("/requests/:id/offers/:offerId/select", requireTrackingAuth, selectMyOffer);
router.post("/requests/:id/payment-receipt", requireTrackingAuth, handleUpload, uploadPaymentReceipt);
router.post("/requests/:id/mark-transfer-sent", requireTrackingAuth, markMyTransferSent);
router.post("/requests/:id/documents", requireTrackingAuth, handleUpload, uploadDocument);
router.get("/requests/:id/documents/:documentId/file", requireTrackingAuth, downloadMyDocumentFile);
router.get("/requests/:id/deliverables/:deliverableId/file", requireTrackingAuth, downloadMyDeliverableFile);
router.post("/logout", requireTrackingAuth, logout);

export default router;
