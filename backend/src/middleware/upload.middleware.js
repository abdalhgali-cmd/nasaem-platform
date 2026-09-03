import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import multer from "multer";

// This module is imported before app.js top-level code runs, so load .env here
// before reading UPLOAD_ROOT. Railway/Vercel-style injected environment
// variables still take precedence because dotenv does not overwrite them.
dotenv.config();

const configuredUploadRoot = process.env.UPLOAD_ROOT?.trim();

if (process.env.NODE_ENV === "production") {
  if (!configuredUploadRoot) {
    throw new Error(
      "Unsafe production storage configuration: UPLOAD_ROOT is required. Mount persistent storage and set UPLOAD_ROOT to its absolute path before starting the API.",
    );
  }

  if (!path.isAbsolute(configuredUploadRoot)) {
    throw new Error(
      "Unsafe production storage configuration: UPLOAD_ROOT must be an absolute path on the mounted persistent volume.",
    );
  }
}

const UPLOAD_ROOT = path.resolve(configuredUploadRoot || "uploads");
const uploadDir = (...parts) => path.join(UPLOAD_ROOT, ...parts);

const UPLOAD_DIR = uploadDir("documents");
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

const CONTACT_REQUEST_DOCUMENT_DIR = uploadDir("contact-request-documents");
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

const CONTACT_REQUEST_DELIVERABLE_DIR = uploadDir("contact-request-deliverables");
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

const SITE_ASSET_DIR = uploadDir("site-assets");
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

const MOTION_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

function motionVideoFileFilter(req, file, cb) {
  if (!MOTION_VIDEO_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Unsupported file type. Allowed: MP4, WEBM."));
  }

  cb(null, true);
}

// A service's optional decorative motion clip (e.g. a short looping hero
// background video) — same site-assets directory/storage as uploadSiteAsset
// above (it's still public marketing media, never a customer document), just
// a video-only MIME allow-list and a larger size ceiling for clip length.
export const uploadSiteMotionAsset = multer({
  storage: siteAssetStorage,
  fileFilter: motionVideoFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
}).single("video");
