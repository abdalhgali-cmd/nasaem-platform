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
