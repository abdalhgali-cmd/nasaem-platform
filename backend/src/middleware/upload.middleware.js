import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";

const UPLOAD_DIR = path.resolve("uploads", "documents");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WEBP, PDF."));
  }

  cb(null, true);
}

export const uploadDocument = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

const CONTACT_REQUEST_DOCUMENT_DIR = path.resolve("uploads", "contact-request-documents");
fs.mkdirSync(CONTACT_REQUEST_DOCUMENT_DIR, { recursive: true });

const contactRequestDocumentStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, CONTACT_REQUEST_DOCUMENT_DIR);
  },
  filename(req, file, cb) {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Customer-uploaded documents (via /track) — same allowed types/size as
// staff-side documents, kept in a separate directory since these are
// unreviewed input from the public until staff accept/reject them.
export const uploadContactRequestDocument = multer({
  storage: contactRequestDocumentStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

// Same storage/validation as uploadContactRequestDocument above, but for the
// Public Service Intake wizard's single combined submission — the customer
// attaches several required documents (passport, photo, ...) alongside the
// rest of the intake form in one POST /api/contact-requests, before a
// tracking session (phone verification) exists to own a separate upload.
export const uploadContactRequestIntakeDocuments = multer({
  storage: contactRequestDocumentStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).array("documents", 6);

const CONTACT_REQUEST_DELIVERABLE_DIR = path.resolve("uploads", "contact-request-deliverables");
fs.mkdirSync(CONTACT_REQUEST_DELIVERABLE_DIR, { recursive: true });

const contactRequestDeliverableStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, CONTACT_REQUEST_DELIVERABLE_DIR);
  },
  filename(req, file, cb) {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Staff-uploaded finished deliverables (issued visa, ticket, voucher) for
// the customer to download from /track — same allowed types/size as the
// other document uploads, kept in its own directory since these are
// trusted staff output, not customer input awaiting review.
export const uploadContactRequestDeliverable = multer({
  storage: contactRequestDeliverableStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function imageFileFilter(req, file, cb) {
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WEBP."));
  }

  cb(null, true);
}

// Passport scans are processed in-memory for OCR and never written to disk —
// they aren't a stored document, just a transient input to text extraction.
export const uploadPassportImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
}).single("image");

const SITE_ASSET_DIR = path.resolve("uploads", "site-assets");
fs.mkdirSync(SITE_ASSET_DIR, { recursive: true });

const siteAssetStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, SITE_ASSET_DIR);
  },
  filename(req, file, cb) {
    // Content-changing filename on every upload — the marketing site's
    // fetch URL includes ?v=<updatedAt>, so a fresh name here isn't what
    // busts caches, but it does avoid ever overwriting a file that a
    // browser/CDN might still have an in-flight request for.
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

export const uploadSiteAsset = multer({
  storage: siteAssetStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("image");
