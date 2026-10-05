// Pure upload rules shared with the picker wrapper (src/utils/uploads.ts). They
// mirror the server's limits (backend/src/middleware/upload.middleware.js:
// JPEG/PNG/WEBP/PDF, 10 MB) so a bad file is refused on the phone with a clear
// message instead of failing after a slow upload.

export const DEFAULT_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export type UploadCandidate = { name: string; mimeType?: string | null; size?: number | null };

/** Some Android pickers report no/generic MIME types; fall back to the extension. */
export function effectiveMimeType(file: UploadCandidate): string | null {
  const declared = (file.mimeType ?? "").toLowerCase();
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? null;
}

/** Returns an Arabic error message, or null when the file is acceptable. */
export function validateUploadFile(
  file: UploadCandidate,
  options: { allowedTypes?: readonly string[]; maxBytes?: number | null } = {}
): string | null {
  const allowed = (options.allowedTypes?.length ? options.allowedTypes : DEFAULT_UPLOAD_TYPES).map((type) => type.toLowerCase());
  const maxBytes = Math.min(options.maxBytes && options.maxBytes > 0 ? options.maxBytes : MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES);

  const type = effectiveMimeType(file);
  if (!type || !allowed.includes(type)) return "نوع الملف غير مدعوم. الأنواع المسموحة: JPEG وPNG وWEBP وPDF.";
  if (typeof file.size === "number" && file.size > maxBytes) {
    return `حجم الملف كبير. الحد الأقصى ${Math.round(maxBytes / (1024 * 1024))} ميغابايت.`;
  }
  if (typeof file.size === "number" && file.size === 0) return "الملف فارغ.";
  return null;
}
