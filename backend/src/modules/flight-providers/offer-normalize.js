// Normalizes one provider fare offer into the platform's shape, or returns
// null when anything the customer would rely on is missing. Nothing is
// assumed: no default currency, no derived child/infant prices, no guessed
// baggage, and an offer without a validity time is not an offer.

const CABINS = { Y: "ECONOMY", ECONOMY: "ECONOMY", W: "PREMIUM_ECONOMY", PREMIUM_ECONOMY: "PREMIUM_ECONOMY", C: "BUSINESS", J: "BUSINESS", BUSINESS: "BUSINESS", F: "FIRST", FIRST: "FIRST" };
const PASSENGER_TYPES = ["ADULT", "CHILD", "INFANT"];

const iata = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
};
const currencyCode = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
};
const isoTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
};

function normalizeSegment(raw) {
  const origin = iata(raw?.origin ?? raw?.from);
  const destination = iata(raw?.destination ?? raw?.to);
  const departureAt = isoTime(raw?.departureAt ?? raw?.departure);
  const arrivalAt = isoTime(raw?.arrivalAt ?? raw?.arrival);
  const carrier = String(raw?.carrier ?? raw?.marketingCarrier ?? "").trim().toUpperCase();
  const flightNumber = String(raw?.flightNumber ?? "").trim().toUpperCase();
  if (!origin || !destination || !departureAt || !arrivalAt || !carrier || !flightNumber) return null;
  if (new Date(arrivalAt) <= new Date(departureAt)) return null;
  return { origin, destination, departureAt, arrivalAt, carrier, flightNumber };
}

function normalizeBaggage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pieces = Number(raw.pieces);
  const weightKg = Number(raw.weightKg ?? raw.kg);
  const checked = {
    ...(Number.isInteger(pieces) && pieces >= 0 ? { pieces } : {}),
    ...(Number.isFinite(weightKg) && weightKg > 0 ? { weightKg } : {}),
  };
  return Object.keys(checked).length ? checked : null;
}

export function normalizeProviderOffer(raw, { providerCode, now = new Date() } = {}) {
  if (!raw || typeof raw !== "object" || !providerCode) return null;
  const offerId = String(raw.offerId ?? raw.id ?? "").trim();
  const currency = currencyCode(raw.currency);
  const total = money(raw.total ?? raw.totalPrice);
  const validUntil = isoTime(raw.validUntil ?? raw.expiresAt);
  const segments = Array.isArray(raw.segments) ? raw.segments.map(normalizeSegment) : [];
  if (!offerId || !currency || !total || !validUntil || !segments.length || segments.some((s) => !s)) return null;
  if (new Date(validUntil) <= now) return null;
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].origin !== segments[i - 1].destination) return null;
    if (new Date(segments[i].departureAt) <= new Date(segments[i - 1].arrivalAt)) return null;
  }

  const passengerPrices = {};
  for (const type of PASSENGER_TYPES) {
    const entry = raw.passengerPrices?.[type] ?? raw.passengerPrices?.[type.toLowerCase()];
    const amount = money(entry?.amount ?? entry);
    const entryCurrency = currencyCode(entry?.currency ?? currency);
    if (amount && entryCurrency === currency) passengerPrices[type] = amount;
  }

  return {
    provider: providerCode,
    offerId,
    segments,
    origin: segments[0].origin,
    destination: segments.at(-1).destination,
    stops: segments.length - 1,
    cabin: CABINS[String(raw.cabin ?? "").trim().toUpperCase()] ?? null,
    baggage: normalizeBaggage(raw.baggage),
    fareRules: typeof raw.fareRules === "string" && raw.fareRules.trim() ? raw.fareRules.trim().slice(0, 2000) : null,
    currency,
    total,
    // Only the passenger types the provider priced itself; never derived.
    passengerPrices: Object.keys(passengerPrices).length ? passengerPrices : null,
    validUntil,
  };
}
