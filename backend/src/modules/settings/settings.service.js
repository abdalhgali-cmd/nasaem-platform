import prisma from "../../config/database.js";

export const PUBLIC_SETTING_KEYS = [
  "CONTACT_PHONE",
  "CONTACT_EMAIL",
  "CONTACT_ADDRESS",
  "WHATSAPP_NUMBER",
  "INSTAGRAM_URL",
  "FACEBOOK_URL",
  "X_URL",
  "SEO_TITLE",
  "SEO_DESCRIPTION",
  // Admin-editable FAQ for the Egypt Security Approval landing page — a
  // JSON string of [{ question, answer }, ...]. Reuses the existing
  // Setting/public-settings infrastructure instead of a new FAQ module;
  // editable today via the staff back-office's free-form Settings editor
  // (frontend/admin-dashboard.html) with no code change needed to update
  // its content.
  "EGYPT_CLEARANCE_FAQ",
  // Same admin-editable-FAQ pattern for the Saudi Family Visit landing page.
  "SAUDI_FAMILY_VISIT_FAQ",
];

export async function listSettings() {
  return prisma.setting.findMany({
    orderBy: { key: "asc" },
  });
}

export async function getPublicSettings() {
  return prisma.setting.findMany({
    where: { key: { in: PUBLIC_SETTING_KEYS } },
    orderBy: { key: "asc" },
    select: { key: true, value: true },
  });
}

export async function upsertSetting(data) {
  return prisma.setting.upsert({
    where: { key: data.key },
    update: {
      value: data.value,
    },
    create: {
      key: data.key,
      value: data.value,
    },
  });
}
