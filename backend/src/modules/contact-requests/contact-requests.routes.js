import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";
import {
  uploadPassportImage,
  uploadContactRequestPassportImages as uploadPassportImageFiles,
  uploadContactRequestPaymentReceipt as uploadPaymentReceiptFile,
} from "../../middleware/upload.middleware.js";
import {
  getContactRequestPassportImage,
  getContactRequestPaymentReceipt,
  getContactRequests,
  patchContactRequestPaymentStatus,
  patchContactRequestStatus,
  scanPassportForContactRequest,
  storeContactRequest,
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
// passport photo, plus one batched image upload and one receipt upload.
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
// only ever known to whoever received the POST "/" response). All
// travelers' passport photos are sent together as one batch under the
// "images" field.
router.post("/:id/passport-image", publicFileLimiter, uploadPassportImageFiles, uploadContactRequestPassportImages);
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
router.get(
  "/:id/passport-image/:index",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestPassportImage
);
router.get(
  "/:id/payment-receipt",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN", "EMPLOYEE"),
  getContactRequestPaymentReceipt
);

export default router;
