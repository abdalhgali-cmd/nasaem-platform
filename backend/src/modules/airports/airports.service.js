import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listAirports({ page, limit, skip }) {
  const [data, total] = await Promise.all([
    prisma.airport.findMany({ orderBy: { nameEn: "asc" }, skip, take: limit }),
    prisma.airport.count(),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function createAirport(data) {
  return prisma.airport.create({
    data: {
      nameAr: data.nameAr,
      nameEn: data.nameEn || null,
      cityAr: data.cityAr,
      cityEn: data.cityEn || null,
      countryAr: data.countryAr,
      countryEn: data.countryEn || null,
      iataCode: data.iataCode || null,
      icaoCode: data.icaoCode || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      active: typeof data.active === "boolean" ? data.active : true,
    },
  });
}

export async function updateAirport(id, data) {
  const existing = await prisma.airport.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.airport.update({ where: { id }, data });
}

export async function deleteAirport(id) {
  const existing = await prisma.airport.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.airport.delete({ where: { id } });
  return existing;
}

const PUBLIC_AIRPORT_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  cityAr: true,
  cityEn: true,
  countryAr: true,
  countryEn: true,
  iataCode: true,
  icaoCode: true,
  latitude: true,
  longitude: true,
};

// Platform 3.0 Phase 11: server-side autocomplete. Matches Arabic or
// English, airport name or city, IATA or ICAO — a single free-text query
// checked against every one of those columns with a case-insensitive
// partial match, so "جدة", "Jeddah", "King Abdulaziz", "JED" and "OEJN"
// all find the same airport (the plan's own examples). A raw code query
// (2-4 uppercase letters) also matches on an exact code, so a short query
// isn't drowned out by unrelated partial name matches.
export async function searchAirports(query, { limit = 10 } = {}) {
  const term = query.trim();
  const upper = term.toUpperCase();

  return prisma.airport.findMany({
    where: {
      active: true,
      OR: [
        { nameAr: { contains: term, mode: "insensitive" } },
        { nameEn: { contains: term, mode: "insensitive" } },
        { cityAr: { contains: term, mode: "insensitive" } },
        { cityEn: { contains: term, mode: "insensitive" } },
        { iataCode: upper },
        { icaoCode: upper },
      ],
    },
    orderBy: { nameEn: "asc" },
    take: limit,
    select: PUBLIC_AIRPORT_SELECT,
  });
}
