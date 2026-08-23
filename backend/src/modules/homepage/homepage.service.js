import prisma from "../../config/database.js";
import { HOMEPAGE_HERO_SETTING_KEYS } from "./homepage.constants.js";

export async function getHeroContent() {
  const keys = Object.values(HOMEPAGE_HERO_SETTING_KEYS);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    title: byKey[HOMEPAGE_HERO_SETTING_KEYS.title] ?? null,
    description: byKey[HOMEPAGE_HERO_SETTING_KEYS.description] ?? null,
    ctaLabel: byKey[HOMEPAGE_HERO_SETTING_KEYS.ctaLabel] ?? null,
    ctaTarget: byKey[HOMEPAGE_HERO_SETTING_KEYS.ctaTarget] ?? null,
  };
}

export async function updateHeroContent(data) {
  const updates = [];
  for (const [field, settingKey] of Object.entries(HOMEPAGE_HERO_SETTING_KEYS)) {
    if (!(field in data)) continue;
    const value = data[field];
    updates.push(
      value
        ? prisma.setting.upsert({ where: { key: settingKey }, update: { value }, create: { key: settingKey, value } })
        : prisma.setting.deleteMany({ where: { key: settingKey } }),
    );
  }
  await Promise.all(updates);
  return getHeroContent();
}

export async function listSections({ includeHidden = false } = {}) {
  return prisma.homepageSection.findMany({
    where: includeHidden ? undefined : { visible: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createSection(data) {
  return prisma.homepageSection.create({
    data: {
      key: data.key,
      title: data.title,
      description: data.description || null,
      href: data.href || null,
      iconKey: data.iconKey || null,
      sortOrder: data.sortOrder ?? 0,
      visible: data.visible ?? true,
    },
  });
}

export async function updateSection(id, data) {
  const existing = await prisma.homepageSection.findUnique({ where: { id } });
  if (!existing) return null;

  return prisma.homepageSection.update({
    where: { id },
    data: {
      title: data.title,
      description: "description" in data ? data.description || null : undefined,
      href: "href" in data ? data.href || null : undefined,
      iconKey: "iconKey" in data ? data.iconKey || null : undefined,
      sortOrder: data.sortOrder,
      visible: data.visible,
    },
  });
}

export async function deleteSection(id) {
  const existing = await prisma.homepageSection.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.homepageSection.delete({ where: { id } });
  return existing;
}

export function sectionImageKey(sectionId) {
  return `homepage-section-${sectionId}`;
}

export async function setSectionImageKey(id, imageKey) {
  const existing = await prisma.homepageSection.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.homepageSection.update({ where: { id }, data: { imageKey } });
}

export async function getPublicHomepage() {
  const [hero, sections] = await Promise.all([getHeroContent(), listSections({ includeHidden: false })]);
  return { hero, sections };
}
