import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { resolveUploadPath } from "../config/uploadRoot.js";

// UPLOAD_ROOT resolution (including the production fail-closed check)
// lives in ../config/uploadRoot.js — every module that later reads,
// serves, or deletes a stored file imports UPLOAD_ROOT from that same
// module, so the write path here can never disagree with a read/delete
// path about where the persistent volume is mounted.
const uploadDir = resolveUploadPath;

const UPLOAD_DIR = uploadDir("documents");
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

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function detectMimeTypeFromSignature(buffer) {
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

function validatedDiskStorage(directory, allowedMimeTypes, allowedLabel) {
  return {
    _handleFile(req, file, cb) {
      const chunks = [];
      file.stream.on("data", (chunk) => chunks.push(chunk));
      file.stream.once("error", cb);
      file.stream.once("end", () => {
        const buffer = Buffer.concat(chunks);
        const detectedMimeType = detectMimeTypeFromSignature(buffer);
        if (!detectedMimeType || !allowedMimeTypes.has(detectedMimeType)) {
          console.warn("[Upload Validation] File rejected", {
            fileName: file.originalname,
            declaredMimeType: file.mimetype || "not-set",
            detectedMimeType: detectedMimeType || "unrecognized",
            bufferSize: buffer.length,
          });
          cb(new Error(`Unsupported file type. Allowed: ${allowedLabel}.`));
          return;
        }

        const filename = generateUniqueFilename(file.originalname);
        const filePath = saveBufferToDirectory(buffer, directory, filename);
        file.mimetype = detectedMimeType;
        cb(null, { destination: directory, filename, path: filePath, size: buffer.length });
      });
    },
    _removeFile(req, file, cb) {
      if (!file.path) return cb(null);
      fs.unlink(file.path, cb);
    },
  };
}

export const uploadDocument = multer({
  storage: validatedDiskStorage(UPLOAD_DIR, ALLOWED_MIME_TYPES, "JPEG, PNG, WEBP, PDF"),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

export const CONTACT_REQUEST_DOCUMENT_DIR = uploadDir("contact-request-documents");
fs.mkdirSync(CONTACT_REQUEST_DOCUMENT_DIR, { recursive: true });

// Customer-uploaded documents (via /track) — same allowed types/size as
// staff-side documents, kept in a separate directory since these are
// unreviewed input from the public until staff accept/reject them.
export const uploadContactRequestDocument = multer({
  storage: validatedDiskStorage(CONTACT_REQUEST_DOCUMENT_DIR, ALLOWED_MIME_TYPES, "JPEG, PNG, WEBP, PDF"),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("file");

// Same storage/validation as uploadContactRequestDocument above, but for the
// Public Service Intake wizard's single combined submission — the customer
// attaches several required documents (passport, photo, ...) alongside the
// rest of the intake form in one POST /api/contact-requests, before a
// tracking session (phone verification) exists to own a separate upload.
export const uploadContactRequestIntakeDocuments = multer({
  storage: validatedDiskStorage(CONTACT_REQUEST_DOCUMENT_DIR, ALLOWED_MIME_TYPES, "JPEG, PNG, WEBP, PDF"),
  limits: { fileSize: 10 * 1024 * 1024 },
}).array("documents", 6);

export const CONTACT_REQUEST_DELIVERABLE_DIR = uploadDir("contact-request-deliverables");
fs.mkdirSync(CONTACT_REQUEST_DELIVERABLE_DIR, { recursive: true });

// Staff-uploaded finished deliverables (issued visa, ticket, voucher) for
// the customer to download from /track — same allowed types/size as the
// other document uploads, kept in its own directory since these are
// trusted staff output, not customer input awaiting review.
export const uploadContactRequestDeliverable = multer({
  storage: validatedDiskStorage(CONTACT_REQUEST_DELIVERABLE_DIR, ALLOWED_MIME_TYPES, "JPEG, PNG, WEBP, PDF"),
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
