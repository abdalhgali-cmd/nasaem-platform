import crypto from "node:crypto";
import { getCurrencyRates } from "./flights.service.js";

function normalizePassengerPrices(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const normalized = {};
  for (const [key, raw] of Object.entries(value)) {
    const type = String(key).toUpperCase();
    const amount = Number(raw?.amount ?? raw?.price ?? raw);
    const currency = String(raw?.currency ?? value.currency ?? "").trim().toUpperCase();
    if (["ADULT", "CHILD", "INFANT"].includes(type) && Number.isFinite(amount) && amount > 0 && currency) {
      normalized[type] = { amount, currency };
    }
  }
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeTripFlight(item, rates) {
  const price = Number(item.price ?? item.amount ?? item.totalPrice);
  const currency = String(item.currency ?? item.priceCurrency ?? "").trim().toUpperCase();
  const airline = String(item.airline ?? item.carrierName ?? item.marketingCarrier ?? "").trim();
  const flightNumber = String(item.flightNumber ?? item.number ?? "").trim();
  const departureAt = item.departureAt ?? item.departure ?? null;
  const arrivalAt = item.arrivalAt ?? item.arrival ?? null;
  if (!Number.isFinite(price) || price <= 0 || !currency || !airline || !flightNumber || !departureAt || !arrivalAt) return null;
  const rate = currency === "SDG" ? 1 : Number(rates[currency] ?? 0);
  return {
    id: `TRIP:${item.id ?? item.reference ?? crypto.createHash("sha256").update(`${airline}|${flightNumber}|${departureAt}|${arrivalAt}`).digest("hex").slice(0, 24)}`,
    source: "TRIP",
    airline,
    flightNumber,
    origin: { code: item.originCode ?? item.fromCode ?? null, name: item.originName ?? item.from ?? "" },
    destination: { code: item.destinationCode ?? item.toCode ?? null, name: item.destinationName ?? item.to ?? "" },
    departureAt,
    arrivalAt,
    durationMinutes: Number(item.durationMinutes ?? item.duration ?? 0) || null,
    stops: Number(item.stops ?? item.stopCount ?? 0),
    baggage: item.baggage ?? item.baggageAllowance ?? null,
    fareRules: item.fareRules ?? item.fareConditions ?? null,
    passengerPrices: normalizePassengerPrices(item.passengerPrices ?? item.pricesByPassengerType),
    cabin: item.cabin ?? item.cabinClass ?? null,
    price,
    currency,
    fxRateToSdg: rate || null,
    priceSdg: rate ? price * rate : null,
    availableSeats: item.availableSeats ?? item.seats ?? null,
    active: true,
    externalRef: item.reference ?? item.id ?? null,
  };
}

export async function searchTripFlights({ legs, travelers = 1, passengers = null }) {
  const url = process.env.TRIP_API_URL;
  if (!url) return { configured: false, legs: [] };

  const rates = await getCurrencyRates();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.TRIP_API_TOKEN ? { authorization: `Bearer ${process.env.TRIP_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({ legs, travelers, ...(passengers ? { passengers } : {}) }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Trip provider returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const rawLegs = Array.isArray(payload) ? payload : (payload.legs ?? payload.data ?? payload.results ?? []);
  const normalized = Array.isArray(rawLegs) && rawLegs.length && Array.isArray(rawLegs[0])
    ? rawLegs.map((leg) => leg.map((item) => normalizeTripFlight(item, rates)).filter(Boolean))
    : [Array.isArray(rawLegs) ? rawLegs.map((item) => normalizeTripFlight(item, rates)).filter(Boolean) : []];

  return { configured: true, legs: normalized };
}
