import { z } from "zod";
import { SITE_ASSET_KEYS } from "./site-assets.constants.js";

export const siteAssetKeyParamSchema = z.object({
  key: z.enum(SITE_ASSET_KEYS),
});

// The read-only file route also serves images uploaded through other
// modules' dynamic key namespaces (e.g. homepage section images —
// "homepage-section-<sectionId>", written via
// POST /api/homepage/sections/:id/image, not through this module's
// fixed-slot upload route). Safe to accept more broadly here: this only
// ever looks up an existing SiteAsset row by exact key match and serves
// whichever file is on record for it (or 404s) — there's no path-traversal
// surface since the on-disk filename is always server-generated (see
// upload.middleware.js's siteAssetStorage), never derived from this key.
export const siteAssetFileKeyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
});
