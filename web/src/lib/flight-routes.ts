// Shared destination/route data for the flight search widget and the
// flight-booking sections. Prices are round-trip, per class, in USD — still
// illustrative placeholders (see README "Content that needs real values
// before shipping"), not pulled from a live fare API.
export type FlightRoute = {
  from: string;
  to: string;
  duration: string;
  roundTripPrices: {
    economy: number;
    business?: number;
  };
};

export const FLIGHT_ROUTES: FlightRoute[] = [
  { from: "الخرطوم", to: "جدة", duration: "٣ ساعات", roundTripPrices: { economy: 780, business: 2450 } },
  { from: "الخرطوم", to: "المدينة المنورة", duration: "٣ ساعات و١٥ دقيقة", roundTripPrices: { economy: 860, business: 2600 } },
  { from: "الخرطوم", to: "القاهرة", duration: "ساعتان و٤٥ دقيقة", roundTripPrices: { economy: 490, business: 1350 } },
  { from: "الخرطوم", to: "دبي", duration: "٤ ساعات", roundTripPrices: { economy: 980, business: 2900 } },
  { from: "الخرطوم", to: "إسطنبول", duration: "٥ ساعات و٣٠ دقيقة", roundTripPrices: { economy: 1150, business: 3200 } },
  { from: "الخرطوم", to: "الرياض", duration: "٣ ساعات و٣٠ دقيقة", roundTripPrices: { economy: 690, business: 2050 } },
  { from: "الخرطوم", to: "الدوحة", duration: "٣ ساعات و٤٥ دقيقة", roundTripPrices: { economy: 720, business: 2100 } },
  { from: "بورتسودان", to: "جدة", duration: "ساعة واحدة", roundTripPrices: { economy: 360 } },
];

export const ORIGIN_CITIES = Array.from(new Set(FLIGHT_ROUTES.map((r) => r.from)));
export const DESTINATION_CITIES = Array.from(new Set(FLIGHT_ROUTES.map((r) => r.to)));

export const CABIN_CLASSES = [
  { value: "economy", label: "اقتصادية" },
  { value: "business", label: "رجال الأعمال" },
] as const;

// Near-term dates often have thin business/first-class inventory, so the
// search widget defaults this far out rather than to "today" — the user can
// still freely pick any date.
export function defaultFarDepartureDate(daysOut = 60): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  return d.toISOString().slice(0, 10);
}

export function defaultFarReturnDate(daysOut = 70): string {
  return defaultFarDepartureDate(daysOut);
}
