import prisma from "../../config/database.js";
import { THEME_SETTING_KEYS } from "./theme.constants.js";

export async function getThemeColors() {
  const keys = Object.values(THEME_SETTING_KEYS);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return Object.fromEntries(
    Object.entries(THEME_SETTING_KEYS).map(([field, settingKey]) => [field, byKey[settingKey] ?? null]),
  );
}

export async function updateThemeColors(data) {
  const updates = [];
  for (const [field, settingKey] of Object.entries(THEME_SETTING_KEYS)) {
    if (!(field in data)) continue;
    const value = data[field];
    updates.push(
      value
        ? prisma.setting.upsert({ where: { key: settingKey }, update: { value }, create: { key: settingKey, value } })
        : prisma.setting.deleteMany({ where: { key: settingKey } }),
    );
  }
  await Promise.all(updates);
  return getThemeColors();
}
