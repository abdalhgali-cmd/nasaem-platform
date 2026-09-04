import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";

const UPLOAD_DIR = path.resolve("uploads", "documents");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export function generateUniqueFilename(originalname) {
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(originalname)}`;
}

export function saveBufferToDirectory(buffer, directory, filename) {
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

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

function detectMimeTypeFromSignature(buffer) {
  if (!buffer || buffer.length < 4) return null;

  const bytes = buffer;

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (bytes.length >= 12 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return "image/webp";
    }
  }

  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }

  return null;
}

function fileFilter(req, file, cb) {
  const declaredMimeType = file.mimetype;

  const buffer = file.buffer || (file._readableState ? file._readableState.objectMode ? null : Buffer.alloc(0) : null);
  const detectedMimeType = buffer ? detectMimeTypeFromSignature(buffer) : null;

  let resolvedMimeType = null;

  if (detectedMimeType && ALLOWED_MIME_TYPES.has(detectedMimeType)) {
    resolvedMimeType = detectedMimeType;
  } else if (declaredMimeType && ALLOWED_MIME_TYPES.has(declaredMimeType)) {
    resolvedMimeType = declaredMimeType;
  }

  if (!resolvedMimeType) {
    const diagnostics = {
      fileName: file.originalname,
      declaredMimeType: declaredMimeType || "not-set",
      detectedMimeType: detectedMimeType || "unrecognized",
      bufferSize: buffer ? buffer.length : 0,
    };
    console.warn(`[Upload Validation] File rejected:`, diagnostics);
    return cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WEBP, PDF."));
  }

  file.mimetype = resolvedMimeType;
  cb(null, true);
}

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

export const CONTACT_REQUEST_DOCUMENT_DIR = path.resolve("uploads", "contact-request-documents");
fs.mkdirSync(CONTACT_REQUEST_DOCUMENT_DIR, { recursive: true });

// Customer-uploaded documents (via /track) — same allowed types/size as
// staff-side documents, kept in a separate directory since these are
// unreviewed input from the public until staff accept/reject them.
export const uploadContactRequestDocument = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

// Same storage/validation as uploadContactRequestDocument above, but for the
// Public Service Intake wizard's single combined submission — the customer
// attaches several required documents (passport, photo, ...) alongside the
// rest of the intake form in one POST /api/contact-requests, before a
// tracking session (phone verification) exists to own a separate upload.
export const uploadContactRequestIntakeDocuments = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).array("documents", 6);

const CONTACT_REQUEST_DELIVERABLE_DIR = path.resolve("uploads", "contact-request-deliverables");
fs.mkdirSync(CONTACT_REQUEST_DELIVERABLE_DIR, { recursive: true });

// Staff-uploaded finished deliverables (issued visa, ticket, voucher) for
// the customer to download from /track — same allowed types/size as the
// other document uploads, kept in its own directory since these are
// trusted staff output, not customer input awaiting review.
export const uploadContactRequestDeliverable = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function imageFileFilter(req, file, cb) {
  const declaredMimeType = file.mimetype;
  const buffer = file.buffer;
  const detectedMimeType = buffer ? detectMimeTypeFromSignature(buffer) : null;

  let resolvedMimeType = null;

  if (detectedMimeType && IMAGE_MIME_TYPES.has(detectedMimeType)) {
    resolvedMimeType = detectedMimeType;
  } else if (declaredMimeType && IMAGE_MIME_TYPES.has(declaredMimeType)) {
    resolvedMimeType = declaredMimeType;
  }

  if (!resolvedMimeType) {
    const diagnostics = {
      fileName: file.originalname,
      declaredMimeType: declaredMimeType || "not-set",
      detectedMimeType: detectedMimeType || "unrecognized",
      bufferSize: buffer ? buffer.length : 0,
    };
    console.warn(`[Upload Validation] Image file rejected:`, diagnostics);
    return cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WEBP."));
  }

  file.mimetype = resolvedMimeType;
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
