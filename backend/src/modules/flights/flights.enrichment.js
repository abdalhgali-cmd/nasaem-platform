import prisma from "../../config/database.js";

// Platform 3.0 Phase 12 — decorates already-fetched flight search results
// (both the manual/internal flight_inventory legs and the Trip.com legs)
// with the matching Airline directory's logo (Phase 10), when an admin
// has configured one. Purely additive display data: never changes which
// flights are returned, their price, ordering, or the Sudanese-airline
// filter in flights.service.js — none of that is touched here. Matching
// is a best-effort case-insensitive name lookup (the only identifying
// field either result shape actually carries); no match just means
// airlineLogoKey stays null, same "don't invent it" posture as every
// other optional-enrichment lookup in this codebase.
export async function attachAirlineLogos(legs) {
  const names = new Set();
  for (const entry of legs) {
    for (const flight of [...entry.manual, ...entry.trip]) {
      if (flight.airline) names.add(flight.airline.trim().toLowerCase());
    }
  }
  if (!names.size) return legs;

  const airlines = await prisma.airline.findMany({
    where: { active: true, logoKey: { not: null } },
    select: { name: true, nameEn: true, logoKey: true },
  });

  const logoByName = new Map();
  for (const airline of airlines) {
    if (airline.name) logoByName.set(airline.name.trim().toLowerCase(), airline.logoKey);
    if (airline.nameEn) logoByName.set(airline.nameEn.trim().toLowerCase(), airline.logoKey);
  }
  if (!logoByName.size) return legs;

  function decorate(flight) {
    const key = flight.airline ? flight.airline.trim().toLowerCase() : null;
    return { ...flight, airlineLogoKey: (key && logoByName.get(key)) || null };
  }

  return legs.map((entry) => ({ ...entry, manual: entry.manual.map(decorate), trip: entry.trip.map(decorate) }));
}
