import prisma from "../../config/database.js";

export async function listSettings() {
  return prisma.setting.findMany({
    orderBy: { key: "asc" },
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
