import { getCurrencyRates } from "./flights.service.js";

function normalizeTripFlight(item, rates) {
  const price = Number(item.price ?? item.amount ?? item.totalPrice ?? 0);
  const currency = String(item.currency ?? item.priceCurrency ?? "USD").toUpperCase();
  const rate = currency === "SDG" ? 1 : Number(rates[currency] ?? 0);
  return {
    id: `TRIP:${item.id ?? item.reference ?? item.flightNumber ?? crypto.randomUUID()}`,
    source: "TRIP",
    airline: item.airline ?? item.carrierName ?? item.marketingCarrier ?? "",
    flightNumber: item.flightNumber ?? item.number ?? "",
    origin: { code: item.originCode ?? item.fromCode ?? null, name: item.originName ?? item.from ?? "" },
    destination: { code: item.destinationCode ?? item.toCode ?? null, name: item.destinationName ?? item.to ?? "" },
    departureAt: item.departureAt ?? item.departure ?? null,
    arrivalAt: item.arrivalAt ?? item.arrival ?? null,
    durationMinutes: Number(item.durationMinutes ?? item.duration ?? 0) || null,
    stops: Number(item.stops ?? item.stopCount ?? 0),
    baggage: item.baggage ?? item.baggageAllowance ?? null,
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

export async function searchTripFlights({ legs, travelers = 1 }) {
  const url = process.env.TRIP_API_URL;
  if (!url) return { configured: false, legs: [] };

  const rates = await getCurrencyRates();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.TRIP_API_TOKEN ? { authorization: `Bearer ${process.env.TRIP_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({ legs, travelers }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Trip provider returned ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const rawLegs = Array.isArray(payload) ? payload : (payload.legs ?? payload.data ?? payload.results ?? []);
  const normalized = Array.isArray(rawLegs) && rawLegs.length && Array.isArray(rawLegs[0])
    ? rawLegs.map((leg) => leg.map((item) => normalizeTripFlight(item, rates)))
    : [Array.isArray(rawLegs) ? rawLegs.map((item) => normalizeTripFlight(item, rates)) : []];

  return { configured: true, legs: normalized };
}
