import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  uploadPassportImage,
  uploadContactRequestPassportImages as uploadPassportImageFiles,
  uploadContactRequestGuarantorIdImages as uploadGuarantorIdImageFiles,
  uploadContactRequestAdditionalDocuments as uploadAdditionalDocumentFiles,
  uploadContactRequestPaymentReceipt as uploadPaymentReceiptFile,
} from "../../middleware/upload.middleware.js";
import {
  getContactRequestAdditionalDocument,
  getContactRequestGuarantorIdImage,
  getContactRequestPassportImage,
  getContactRequestPaymentReceipt,
  getContactRequests,
  patchContactRequestPayment,
  patchContactRequestPaymentStatus,
  patchContactRequestStatus,
  scanPassportForContactRequest,
  storeContactRequest,
  uploadContactRequestAdditionalDocuments,
  uploadContactRequestGuarantorIdImages,
  uploadContactRequestPassportImages,
  uploadContactRequestPaymentReceipt,
} from "./contact-requests.controller.js";

const router = Router();

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
router.post("/passport-scan", publicFileLimiter, uploadPassportImage, scanPassportForContactRequest);

// Public: attaches files to a request the customer just created (its id is
// only ever known to whoever received the POST "/" response). Each
// traveler's passport photo / guarantor Iqama photo is sent as its own
// batch under the "images" field, in person order.
router.post("/:id/passport-image", publicFileLimiter, uploadPassportImageFiles, uploadContactRequestPassportImages);
router.post(
  "/:id/guarantor-id-image",
  publicFileLimiter,
  uploadGuarantorIdImageFiles,
  uploadContactRequestGuarantorIdImages
);
router.post(
  "/:id/additional-documents",
  publicFileLimiter,
  uploadAdditionalDocumentFiles,
  uploadContactRequestAdditionalDocuments
);
router.post("/:id/payment-receipt", publicFileLimiter, uploadPaymentReceiptFile, uploadContactRequestPaymentReceipt);

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
  "/:id/passport-image/:index",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestPassportImage
);
router.get(
  "/:id/guarantor-id-image/:index",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestGuarantorIdImage
);
router.get(
  "/:id/additional-document/:index",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestAdditionalDocument
);
router.get(
  "/:id/payment-receipt",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestPaymentReceipt
);

export default router;
