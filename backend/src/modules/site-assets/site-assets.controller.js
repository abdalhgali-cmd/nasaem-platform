import { siteAssetFileKeyParamSchema, siteAssetKeyParamSchema } from "./site-assets.validators.js";
import { getSiteAssetByKey, listSiteAssets, upsertSiteAsset } from "./site-assets.service.js";

import { resolveStoredUploadPath } from "../../config/uploadRoot.js";

export async function getSiteAssets(req, res, next) {
  try {
    const assets = await listSiteAssets();
    return res.status(200).json({ success: true, data: assets });
  } catch (error) {
    next(error);
  }
}

// Public (unauthenticated) — this is what the marketing site's <img> tags
// point at directly, so it must not require the staff session cookie.
export async function getSiteAssetFile(req, res, next) {
  try {
    const parsed = siteAssetFileKeyParamSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(404).json({ success: false, message: "Unknown asset key" });
    }

    const asset = await getSiteAssetByKey(parsed.data.key);

    if (!asset) {
      return res.status(404).json({ success: false, message: "No asset uploaded for this key" });
    }

    // The stored filename is randomized per upload and the URL is expected
    // to be requested with a ?v=<updatedAt> cache-buster by the caller, so
    // this exact URL's response never actually changes — safe to cache hard.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", asset.mimeType);
    // Helmet's default Cross-Origin-Resource-Policy (same-origin) blocks the
    // marketing site (a different origin) from loading this in an <img>
    // tag — this route exists specifically to be embedded cross-origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    return res.sendFile(resolveStoredUploadPath(asset.storagePath), (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ success: false, message: "Asset file missing on disk" });
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadSiteAsset(req, res, next) {
  try {
    const parsed = siteAssetKeyParamSchema.safeParse(req.params);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image uploaded" });
    }

    const asset = await upsertSiteAsset(parsed.data.key, req.file, req);
    return res.status(200).json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
}
