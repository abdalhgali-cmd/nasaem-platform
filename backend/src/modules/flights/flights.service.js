import crypto from "node:crypto";
import prisma from "../../config/database.js";

const FX_KEYS = {
  USD: "FX_USD_SDG",
  SAR: "FX_SAR_SDG",
  AED: "FX_AED_SDG",
  EGP: "FX_EGP_SDG",
};

const SUDANESE_AIRLINES = new Set(["SUDANAIR", "SUDAN AIR", "TARCO", "TARCO AVIATION", "BADR", "BADR AIRLINES"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeDate(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    date.setUTCHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }
  return date;
}

function isSudaneseAirline(name) {
  const normalized = normalizeText(name).toUpperCase();
  return [...SUDANESE_AIRLINES].some((item) => normalized.includes(item));
}

async function getFxRates() {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(FX_KEYS) } } });
  return Object.fromEntries(Object.entries(FX_KEYS).map(([code, key]) => {
    const row = rows.find((item) => item.key === key);
    const value = Number(row?.value ?? 0);
    return [code, Number.isFinite(value) ? value : 0];
  }));
}

export async function getCurrencyRates() {
  return getFxRates();
}

export async function updateCurrencyRates(input) {
  const entries = Object.entries(FX_KEYS);
  for (const [code, key] of entries) {
    if (input[code] === undefined) continue;
    const value = Number(input[code]);
    if (!Number.isFinite(value) || value < 0) {
      const error = new Error(`Invalid FX rate for ${code}`);
      error.statusCode = 400;
      throw error;
    }
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { id: crypto.randomUUID(), key, value: String(value) },
    });
  }
  return getFxRates();
}

function convertToSdg(price, currency, rates) {
  if (currency === "SDG") return { rate: 1, priceSdg: Number(price) };
  const rate = Number(rates[currency]);
  if (!rate) return { rate: null, priceSdg: null };
  return { rate, priceSdg: Number(price) * rate };
}

function mapRow(row) {
  return {
    id: row.id,
    source: row.source,
    airline: row.airline_name,
    flightNumber: row.flight_number,
    origin: { code: row.origin_code, name: row.origin_name },
    destination: { code: row.destination_code, name: row.destination_name },
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    durationMinutes: row.duration_minutes,
    stops: row.stops,
    baggage: row.baggage,
    cabin: row.cabin,
    price: Number(row.price),
    currency: row.currency,
    fxRateToSdg: row.fx_rate_to_sdg ? Number(row.fx_rate_to_sdg) : null,
    priceSdg: row.price_sdg ? Number(row.price_sdg) : null,
    availableSeats: row.available_seats,
    active: row.active,
    externalRef: row.external_ref,
  };
}

export async function listManualFlights({ page = 1, limit = 50, activeOnly = false } = {}) {
  const offset = (page - 1) * limit;
  const where = activeOnly ? "WHERE active = true" : "";
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM flight_inventory ${where} ORDER BY departure_at ASC LIMIT $1 OFFSET $2`,
    limit,
    offset,
  );
  const countRows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS count FROM flight_inventory ${where}`);
  return { items: rows.map(mapRow), total: countRows[0]?.count ?? 0, page, limit };
}

export async function createManualFlight(input) {
  const departureAt = normalizeDate(input.departureAt);
  const arrivalAt = normalizeDate(input.arrivalAt);
  if (!departureAt || !arrivalAt || arrivalAt <= departureAt) throw new Error("Invalid departure/arrival time");
  const currency = normalizeText(input.currency || "USD").toUpperCase();
  const rates = await getFxRates();
  const { rate, priceSdg } = convertToSdg(input.price, currency, rates);
  const id = crypto.randomUUID();
  const durationMinutes = input.durationMinutes ? Number(input.durationMinutes) : Math.round((arrivalAt - departureAt) / 60000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO flight_inventory
      (id, source, airline_name, flight_number, origin_code, origin_name, destination_code, destination_name,
       departure_at, arrival_at, duration_minutes, stops, baggage, cabin, price, currency, fx_rate_to_sdg, price_sdg,
       available_seats, external_ref, active, created_at, updated_at)
     VALUES ($1,'MANUAL',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    id, normalizeText(input.airline), normalizeText(input.flightNumber), normalizeText(input.originCode) || null,
    normalizeText(input.originName), normalizeText(input.destinationCode) || null, normalizeText(input.destinationName),
    departureAt, arrivalAt, durationMinutes, Number(input.stops || 0), normalizeText(input.baggage) || null,
    normalizeText(input.cabin) || null, Number(input.price), currency, rate, priceSdg,
    input.availableSeats == null ? null : Number(input.availableSeats), normalizeText(input.externalRef) || null, input.active !== false,
  );
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM flight_inventory WHERE id = $1`, id);
  return mapRow(rows[0]);
}

export async function updateManualFlight(id, input) {
  const existing = await prisma.$queryRawUnsafe(`SELECT * FROM flight_inventory WHERE id = $1`, id);
  if (!existing[0]) return null;
  const merged = {
    airline: input.airline ?? existing[0].airline_name,
    flightNumber: input.flightNumber ?? existing[0].flight_number,
    originCode: input.originCode ?? existing[0].origin_code,
    originName: input.originName ?? existing[0].origin_name,
    destinationCode: input.destinationCode ?? existing[0].destination_code,
    destinationName: input.destinationName ?? existing[0].destination_name,
    departureAt: input.departureAt ?? existing[0].departure_at,
    arrivalAt: input.arrivalAt ?? existing[0].arrival_at,
    durationMinutes: input.durationMinutes ?? existing[0].duration_minutes,
    stops: input.stops ?? existing[0].stops,
    baggage: input.baggage ?? existing[0].baggage,
    cabin: input.cabin ?? existing[0].cabin,
    price: input.price ?? existing[0].price,
    currency: input.currency ?? existing[0].currency,
    availableSeats: input.availableSeats ?? existing[0].available_seats,
    externalRef: input.externalRef ?? existing[0].external_ref,
    active: input.active ?? existing[0].active,
  };
  const departureAt = normalizeDate(merged.departureAt);
  const arrivalAt = normalizeDate(merged.arrivalAt);
  const rates = await getFxRates();
  const { rate, priceSdg } = convertToSdg(merged.price, String(merged.currency).toUpperCase(), rates);
  await prisma.$executeRawUnsafe(
    `UPDATE flight_inventory SET airline_name=$2, flight_number=$3, origin_code=$4, origin_name=$5,
      destination_code=$6, destination_name=$7, departure_at=$8, arrival_at=$9, duration_minutes=$10, stops=$11,
      baggage=$12, cabin=$13, price=$14, currency=$15, fx_rate_to_sdg=$16, price_sdg=$17, available_seats=$18,
      external_ref=$19, active=$20, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
    id, merged.airline, merged.flightNumber, merged.originCode || null, merged.originName, merged.destinationCode || null,
    merged.destinationName, departureAt, arrivalAt, Number(merged.durationMinutes || Math.round((arrivalAt - departureAt) / 60000)),
    Number(merged.stops || 0), merged.baggage || null, merged.cabin || null, Number(merged.price), String(merged.currency).toUpperCase(),
    rate, priceSdg, merged.availableSeats == null ? null : Number(merged.availableSeats), merged.externalRef || null, Boolean(merged.active),
  );
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM flight_inventory WHERE id = $1`, id);
  return mapRow(rows[0]);
}

export async function deleteManualFlight(id) {
  await prisma.$executeRawUnsafe(`DELETE FROM flight_inventory WHERE id = $1 AND source = 'MANUAL'`, id);
}

function buildRouteWhere(leg) {
  const conditions = ["active = true", "departure_at >= $1", "departure_at < $2"];
  const params = [normalizeDate(leg.departureDate), normalizeDate(leg.departureDate, true)];
  if (leg.from) {
    conditions.push("(LOWER(origin_code) = LOWER($3) OR LOWER(origin_name) = LOWER($3))");
    params.push(normalizeText(leg.from));
  }
  if (leg.to) {
    conditions.push(`(LOWER(destination_code) = LOWER($${params.length + 1}) OR LOWER(destination_name) = LOWER($${params.length + 1}))`);
    params.push(normalizeText(leg.to));
  }
  return { where: conditions.join(" AND "), params };
}

export async function searchManualFlights(legs) {
  const results = [];
  for (const leg of legs) {
    if (!leg.departureDate) continue;
    const { where, params } = buildRouteWhere(leg);
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM flight_inventory WHERE ${where} ORDER BY price_sdg NULLS LAST, departure_at ASC LIMIT 100`, ...params);
    results.push(rows.filter((row) => isSudaneseAirline(row.airline_name)).map(mapRow));
  }
  return results;
}

export { FX_KEYS };
