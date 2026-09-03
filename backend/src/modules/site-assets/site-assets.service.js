import fs from "fs/promises";
import path from "path";
import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";

import { UPLOAD_ROOT } from "../../config/uploadRoot.js";

export async function listSiteAssets() {
  return prisma.siteAsset.findMany({ orderBy: { key: "asc" } });
}

export async function getSiteAssetByKey(key) {
  return prisma.siteAsset.findUnique({ where: { key } });
}

export async function upsertSiteAsset(key, file, req) {
  const storagePath = path.join("site-assets", file.filename);

  const existing = await prisma.siteAsset.findUnique({ where: { key } });

  const asset = await prisma.siteAsset.upsert({
    where: { key },
    create: {
      key,
      fileName: file.originalname,
      storagePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    },
    update: {
      fileName: file.originalname,
      storagePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    },
  });

  if (existing) {
    // Best-effort cleanup of the file it replaced — the DB row (now
    // pointing at the new file) is the source of truth either way.
    await fs.unlink(path.join(UPLOAD_ROOT, existing.storagePath)).catch(() => {});
  }

  // fileName/storagePath/mimeType/sizeBytes are metadata, never the file's
  // actual bytes — safe to record per Phase 16's "never log passport image
  // bytes" rule (the same posture as every other upload in this file: only
  // ever a path on disk, not the file content, is written anywhere).
  logActivity({
    userId: req.user?.id,
    action: "SITE_ASSET_UPDATED",
    entity: "SiteAsset",
    entityId: asset.id,
    req,
    oldValue: existing,
    newValue: asset,
  });

  return asset;
}
