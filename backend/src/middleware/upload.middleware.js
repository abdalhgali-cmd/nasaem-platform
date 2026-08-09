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

// Files a customer attaches to their own public contact-request submission
// (passport photo, bank-transfer receipt) — unlike `uploadDocument` these
// aren't created by an authenticated staff member, so they're kept in a
// separate directory rather than mixed into uploads/documents.
const CONTACT_REQUEST_FILES_DIR = path.resolve("uploads", "contact-request-files");
fs.mkdirSync(CONTACT_REQUEST_FILES_DIR, { recursive: true });

const contactRequestFileStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, CONTACT_REQUEST_FILES_DIR);
  },
  filename(req, file, cb) {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

export const uploadContactRequestPassportImage = multer({
  storage: contactRequestFileStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
}).single("image");

export const uploadContactRequestPaymentReceipt = multer({
  storage: contactRequestFileStorage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
}).single("image");
