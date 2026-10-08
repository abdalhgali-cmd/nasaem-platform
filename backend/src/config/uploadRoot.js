import path from "path";
import dotenv from "dotenv";

// UPLOAD_ROOT is resolved once, here, and every module that reads,
// writes, or deletes an uploaded file imports it from this module,
// so a persistent-volume change can never move where files are
// written without also moving where they are read from or deleted.

// Loaded before app.js runs, so .env must be loaded here too.
// Railway/Vercel injected environment variables still win because
// dotenv never overwrites an already-set variable.
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

export const UPLOAD_ROOT = path.resolve(configuredUploadRoot || "uploads");

export function resolveUploadPath(...parts) {
  return path.join(UPLOAD_ROOT, ...parts);
}

// Database contract: new rows store a POSIX-like path relative to UPLOAD_ROOT.
// Historical deployments may have stored `uploads/...` or an absolute path
// ending in `/uploads/...`; map those shapes onto the mounted volume without
// permitting arbitrary absolute paths or `..` traversal outside the root.
export function resolveStoredUploadPath(storedPath) {
  if (typeof storedPath !== "string" || !storedPath.trim()) {
    throw new Error("Invalid stored upload path");
  }

  const normalized = storedPath.trim().replaceAll("\\", "/");
  const rootNormalized = UPLOAD_ROOT.replaceAll("\\", "/").replace(/\/$/, "");
  let relativePath = normalized;

  if (normalized === rootNormalized || normalized.startsWith(`${rootNormalized}/`)) {
    relativePath = normalized.slice(rootNormalized.length).replace(/^\/+/, "");
  } else {
    const legacyMarker = "/uploads/";
    const legacyIndex = normalized.lastIndexOf(legacyMarker);
    if (legacyIndex >= 0) {
      relativePath = normalized.slice(legacyIndex + legacyMarker.length);
    } else {
      relativePath = normalized.replace(/^uploads\//, "");
      if (path.posix.isAbsolute(relativePath) || /^[A-Za-z]:\//.test(relativePath)) {
        throw new Error("Stored upload path is outside UPLOAD_ROOT");
      }
    }
  }

  const absolutePath = path.resolve(UPLOAD_ROOT, relativePath);
  const relativeToRoot = path.relative(UPLOAD_ROOT, absolutePath);
  if (relativeToRoot === "" || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("Stored upload path is outside UPLOAD_ROOT");
  }
  return absolutePath;
}
