import { Router } from "express";
import rateLimit from "express-rate-limit";
import { resolveTrackingCodeLimit } from "./tracking-code-limit.js";

import { requireTrackingAuth } from "./tracking-auth.middleware.js";
import { getMyReusableDocuments } from "../case-intelligence/case-intelligence.controller.js";
import { uploadContactRequestDocument } from "../../middleware/upload.middleware.js";
import { requireFeatureEnabled } from "../feature-flags/feature-flags.middleware.js";
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
  saveEgyptTravelPlan,
  selectMyOffer,
  uploadDocument,
  uploadPaymentReceipt,
  verifyCode,
} from "./contact-request-tracking.controller.js";
import { downloadMyReceipt, postMyFlightChoice } from "../egypt-clearance/egypt-customer.controller.js";

const router = Router();

function handleUpload(req, res, next) {
  uploadContactRequestDocument(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message || "File upload failed" });
    next();
  });
}

// Codes per client per 15 minutes: 5, except in a test/development process
// (see tracking-code-limit.js — production ignores TRACKING_CODE_RATE_LIMIT).
const requestCodeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: resolveTrackingCodeLimit(), standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please try again later." } });
const verifyCodeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests. Please try again later." } });

router.post("/request-code", requestCodeLimiter, requestCode);
router.post("/verify-code", verifyCodeLimiter, verifyCode);
router.get("/requests", requireTrackingAuth, getMyRequests);
// Smart Case Operations — Release G (document reuse). The caller's own
// previously-accepted documents, offered for explicit reuse — scoped to the
// phone this session is authenticated as, never a client-supplied id.
router.get("/reusable-documents", requireTrackingAuth, getMyReusableDocuments);
router.get("/payment-accounts", requireTrackingAuth, getMyPaymentAccounts);
router.post("/requests/:id/invoice/approve", requireTrackingAuth, requireFeatureEnabled("CUSTOMER_APPROVAL"), approveMyInvoice);
router.post("/requests/:id/invoice/reject", requireTrackingAuth, requireFeatureEnabled("CUSTOMER_APPROVAL"), rejectMyInvoice);
router.post("/requests/:id/offers/:offerId/select", requireTrackingAuth, selectMyOffer);
router.post("/requests/:id/payment-receipt", requireTrackingAuth, requireFeatureEnabled("CUSTOMER_UPLOAD"), handleUpload, uploadPaymentReceipt);
router.post("/requests/:id/mark-transfer-sent", requireTrackingAuth, markMyTransferSent);
router.post("/requests/:id/documents", requireTrackingAuth, requireFeatureEnabled("CUSTOMER_UPLOAD"), handleUpload, uploadDocument);
// Egypt Security Approval — post-approval travel/circular stage. The same
// authenticated customer updates the same case; an optional booking file is
// accepted in the same multipart request when they already booked elsewhere.
router.post("/requests/:id/egypt-travel-plan", requireTrackingAuth, requireFeatureEnabled("CUSTOMER_UPLOAD"), handleUpload, saveEgyptTravelPlan);
router.get("/requests/:id/documents/:documentId/file", requireTrackingAuth, downloadMyDocumentFile);
router.get("/requests/:id/deliverables/:deliverableId/file", requireTrackingAuth, downloadMyDeliverableFile);
// Egypt approval: "book my flight through Nasaem" (opens one linked booking
// inquiry), and the paid receipt PDF.
router.post("/requests/:id/egypt/flight", requireTrackingAuth, postMyFlightChoice);
router.get("/requests/:id/payment-receipt/file", requireTrackingAuth, downloadMyReceipt);
router.post("/logout", requireTrackingAuth, logout);

export default router;
