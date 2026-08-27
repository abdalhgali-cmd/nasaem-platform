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
