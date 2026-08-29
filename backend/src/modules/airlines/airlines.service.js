import prisma from "../../config/database.js";

export async function listAirlines({ includeInactive = false } = {}) {
  return prisma.airline.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createAirline(data) {
  return prisma.airline.create({
    data: {
      name: data.name,
      nameEn: data.nameEn || null,
      iataCode: data.iataCode || null,
      icaoCode: data.icaoCode || null,
      website: data.website || null,
      active: typeof data.active === "boolean" ? data.active : true,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateAirline(id, data) {
  const existing = await prisma.airline.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.airline.update({ where: { id }, data });
}

export async function deleteAirline(id) {
  const existing = await prisma.airline.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.airline.delete({ where: { id } });
  return existing;
}

export async function setAirlineLogoKey(id, logoKey) {
  const existing = await prisma.airline.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.airline.update({ where: { id }, data: { logoKey } });
}

const PUBLIC_AIRLINE_SELECT = {
  id: true,
  name: true,
  nameEn: true,
  iataCode: true,
  icaoCode: true,
  logoKey: true,
  website: true,
};

export async function listPublicAirlines() {
  return prisma.airline.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: PUBLIC_AIRLINE_SELECT,
  });
}
