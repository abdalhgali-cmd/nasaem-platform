import prisma from "../../config/database.js";
import { PAYMENT_SETTING_KEYS } from "./settings.constants.js";

export async function listSettings() {
  return prisma.setting.findMany({
    orderBy: { key: "asc" },
  });
}

// Public (unauthenticated): the marketing site's Umrah request form needs
// the current exchange rate and bank account numbers to show payment
// instructions, but has no staff session to call the full settings list.
// Deliberately exposes only these three keys, never the whole table.
export async function getPublicPaymentSettings() {
  const keys = Object.values(PAYMENT_SETTING_KEYS);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  const parseRate = (raw) => {
    const rate = raw ? Number(raw) : null;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  };

  return {
    sarToSdgRate: parseRate(byKey[PAYMENT_SETTING_KEYS.SAR_TO_SDG_RATE]),
    usdToSdgRate: parseRate(byKey[PAYMENT_SETTING_KEYS.USD_TO_SDG_RATE]),
    bankAccounts: {
      SAR: byKey[PAYMENT_SETTING_KEYS.BANK_ACCOUNT_SAR] || null,
      SDG: byKey[PAYMENT_SETTING_KEYS.BANK_ACCOUNT_SDG] || null,
      USD: byKey[PAYMENT_SETTING_KEYS.BANK_ACCOUNT_USD] || null,
    },
  };
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
