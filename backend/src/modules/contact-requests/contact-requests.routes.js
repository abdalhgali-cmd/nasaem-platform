import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import { requireCustomerAuth } from "../../middleware/customerAuth.middleware.js";
import {
  uploadPassportImage,
  uploadContactRequestPassportImages as uploadPassportImageFiles,
  uploadContactRequestGuarantorIdImages as uploadGuarantorIdImageFiles,
  uploadContactRequestAdditionalDocuments as uploadAdditionalDocumentFiles,
  uploadContactRequestPaymentReceipt as uploadPaymentReceiptFile,
} from "../../middleware/upload.middleware.js";
import {
  downloadContactRequestDocument,
  getContactRequestDocuments,
  getContactRequestOffers,
  getContactRequestPaymentReceipt,
  getContactRequests,
  getMyContactRequests,
  patchContactRequestDocumentStatus,
  patchContactRequestOffer,
  patchContactRequestPayment,
  patchContactRequestPaymentStatus,
  patchContactRequestStatus,
  postApproveContactRequestOffer,
  postApproveInvoice,
  postCreateContactRequestOffer,
  postWithdrawContactRequestOffer,
  scanPassportForContactRequest,
  storeContactRequest,
  uploadContactRequestAdditionalDocuments,
  uploadContactRequestGuarantorIdImages,
  uploadContactRequestPassportImages,
  uploadContactRequestPaymentReceipt,
} from "./contact-requests.controller.js";

const router = Router();

// A MulterError (oversized file, wrong MIME type, too many files) has no
// statusCode, so passing it straight to next() falls through to the global
// error middleware's 500 default — misleading for what's really a client
// input error. Wrap every upload middleware below the same way
// documents.routes.js/site-assets.routes.js/passport-ocr.routes.js already do.
function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message || "File upload failed",
        });
      }
      next();
    });
  };
}

// This is the only public (unauthenticated) write endpoint in the API — the
// marketing site's contact form posts here directly from the browser.
// Tighter than the general API limiter (app.js) since it's an open target
// for spam with no auth gate in front of it.
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

// Separate (and separately budgeted) from publicContactLimiter: passport
// OCR is CPU-heavy (Tesseract), so this needs its own tight cap, and file
// uploads happen as follow-up requests against an *existing* contact
// request rather than sharing the initial-submission budget. Sized for a
// group of up to 7 travelers each scanning (and occasionally retrying) a
// passport photo, plus batched passport/Iqama image uploads and one
// receipt upload.
const publicFileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

router.post("/", publicContactLimiter, storeContactRequest);

// Public: prefills the passport number on the Umrah request form. Never
// stores the image — see scanPassportForContactRequest.
router.post("/passport-scan", publicFileLimiter, handleUpload(uploadPassportImage), scanPassportForContactRequest);

// Public: attaches files to a request the customer just created (its id is
// only ever known to whoever received the POST "/" response). Each
// traveler's passport photo / guarantor Iqama photo is sent as its own
// batch under the "images" field, in person order.
router.post(
  "/:id/passport-image",
  publicFileLimiter,
  handleUpload(uploadPassportImageFiles),
  uploadContactRequestPassportImages
);
router.post(
  "/:id/guarantor-id-image",
  publicFileLimiter,
  handleUpload(uploadGuarantorIdImageFiles),
  uploadContactRequestGuarantorIdImages
);
router.post(
  "/:id/additional-documents",
  publicFileLimiter,
  handleUpload(uploadAdditionalDocumentFiles),
  uploadContactRequestAdditionalDocuments
);
router.post(
  "/:id/payment-receipt",
  publicFileLimiter,
  handleUpload(uploadPaymentReceiptFile),
  uploadContactRequestPaymentReceipt
);

router.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequests
);
router.get("/mine", requireCustomerAuth, getMyContactRequests);
router.post("/:id/invoice/approve", requireCustomerAuth, postApproveInvoice);
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  patchContactRequestStatus
);
router.patch(
  "/:id/payment-status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  patchContactRequestPaymentStatus
);
router.patch(
  "/:id/payment",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  patchContactRequestPayment
);
router.get(
  "/:id/documents",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestDocuments
);
router.get(
  "/:id/documents/:documentId/file",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  downloadContactRequestDocument
);
router.patch(
  "/:id/documents/:documentId/status",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  patchContactRequestDocumentStatus
);
router.get(
  "/:id/payment-receipt",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestPaymentReceipt
);
router.post(
  "/:id/offers",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  postCreateContactRequestOffer
);
router.get(
  "/:id/offers",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestOffers
);
router.patch(
  "/:id/offers/:offerId",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  patchContactRequestOffer
);
router.post(
  "/:id/offers/:offerId/withdraw",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  postWithdrawContactRequestOffer
);
router.post("/:id/offers/:offerId/approve", requireCustomerAuth, postApproveContactRequestOffer);

export default router;
