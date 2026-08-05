import fs from "fs/promises";
import path from "path";
import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";

const UPLOAD_ROOT = path.resolve("uploads");

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

  logActivity({
    userId: req.user?.id,
    action: "SITE_ASSET_UPDATED",
    entity: "SiteAsset",
    entityId: asset.id,
    req,
  });

  return asset;
}
