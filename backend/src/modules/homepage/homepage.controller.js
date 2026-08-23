import { createSectionSchema, updateHeroSchema, updateSectionSchema } from "./homepage.validators.js";
import {
  createSection,
  deleteSection,
  getHeroContent,
  getPublicHomepage,
  listSections,
  sectionImageKey,
  setSectionImageKey,
  updateHeroContent,
  updateSection,
} from "./homepage.service.js";
import { upsertSiteAsset } from "../site-assets/site-assets.service.js";
import { logActivity } from "../../utils/activityLog.js";
import prisma from "../../config/database.js";

export async function getPublic(req, res, next) {
  try {
    const data = await getPublicHomepage();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getHero(req, res, next) {
  try {
    const data = await getHeroContent();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function patchHero(req, res, next) {
  try {
    const parsed = updateHeroSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await getHeroContent();
    const data = await updateHeroContent(parsed.data);
    logActivity({ userId: req.user?.id, action: "HOMEPAGE_HERO_UPDATED", entity: "Homepage", entityId: "hero", req, oldValue: before, newValue: data });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getSections(req, res, next) {
  try {
    const data = await listSections({ includeHidden: true });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function storeSection(req, res, next) {
  try {
    const parsed = createSectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const section = await createSection(parsed.data);
    logActivity({ userId: req.user?.id, action: "HOMEPAGE_SECTION_CREATED", entity: "HomepageSection", entityId: section.id, req, newValue: section });
    return res.status(201).json({ success: true, data: section });
  } catch (error) {
    next(error);
  }
}

export async function patchSection(req, res, next) {
  try {
    const parsed = updateSectionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await prisma.homepageSection.findUnique({ where: { id: req.params.id } });
    const section = await updateSection(req.params.id, parsed.data);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });

    logActivity({ userId: req.user?.id, action: "HOMEPAGE_SECTION_UPDATED", entity: "HomepageSection", entityId: section.id, req, oldValue: before, newValue: section });
    return res.status(200).json({ success: true, data: section });
  } catch (error) {
    next(error);
  }
}

export async function destroySection(req, res, next) {
  try {
    const section = await deleteSection(req.params.id);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });

    logActivity({ userId: req.user?.id, action: "HOMEPAGE_SECTION_DELETED", entity: "HomepageSection", entityId: section.id, req, oldValue: section });
    return res.status(200).json({ success: true, message: "Section deleted" });
  } catch (error) {
    next(error);
  }
}

export async function uploadSectionImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    // Checked before touching disk/SiteAsset: a non-existent section must
    // never leave behind an orphaned upload.
    const exists = await prisma.homepageSection.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ success: false, message: "Section not found" });

    const key = sectionImageKey(req.params.id);
    // upsertSiteAsset stores the image + logs its own SITE_ASSET_UPDATED
    // activity entry.
    await upsertSiteAsset(key, req.file, req);
    const section = await setSectionImageKey(req.params.id, key);

    return res.status(200).json({ success: true, data: section });
  } catch (error) {
    next(error);
  }
}
