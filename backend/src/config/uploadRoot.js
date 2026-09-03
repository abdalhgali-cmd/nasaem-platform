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
