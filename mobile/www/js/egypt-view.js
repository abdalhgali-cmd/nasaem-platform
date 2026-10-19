// Egypt security approval (موافقة حربي): the variants the agency publishes,
// one per entry method (backend egypt-clearance-variants.js). Each variant is
// a catalog visa type with its own configured price; nothing here invents or
// reuses another item's price. Pure, unit-tested without a DOM.
import { fixedPricing, moneyText } from "./pricing-view.js";
import { startingPrice, sdgText, SDG_UNAVAILABLE_NOTICE } from "./service-view.js";

// Short type labels (the catalog name of a variant is the agency's own).
export const EGYPT_VARIANTS = Object.freeze([
  { code: "VISA-EGYPT-CLEARANCE-AIR", entryMode: "AIR", name: "جوي — مطار القاهرة" },
  { code: "VISA-EGYPT-CLEARANCE-BORDER", entryMode: "BORDER", name: "بري — المعبر" },
]);
export const EGYPT_VARIANT_CODES = Object.freeze(EGYPT_VARIANTS.map((variant) => variant.code));
export const EGYPT_UNAVAILABLE = "غير متاحة للحجز حاليًا";
const EGYPT_CODES = new Set(["VISA-EGYPT-CLEARANCE", "SVC-EGYPT-CLEARANCE", ...EGYPT_VARIANT_CODES]);

export function isEgyptClearanceItem(item) {
  return EGYPT_CODES.has(String(item?.code || "").toUpperCase());
}

// Published (active) variants, air first. Empty when the agency has not
// activated them yet: the original single item is used then.
export function egyptVariants(catalog) {
  const visaTypes = catalog?.visaTypes || [];
  return EGYPT_VARIANT_CODES.map((code) => visaTypes.find((item) => String(item.code || "").toUpperCase() === code)).filter(Boolean);
}

// Both variants, always listed. A variant can be booked only when the agency
// published it with a fixed price (active, FIXED, positive price): its card
// shows that price. Otherwise it shows «غير متاحة للحجز حاليًا» and cannot be
// chosen; there is no quote fallback and no switch to the original item.
export function egyptVariantOptions(catalog) {
  const published = egyptVariants(catalog);
  return EGYPT_VARIANTS.map((variant) => {
    const item = published.find((candidate) => String(candidate.code || "").toUpperCase() === variant.code) || null;
    const bookable = Boolean(item && fixedPricing(item));
    return { ...variant, item: bookable ? item : null, bookable, priceText: bookable ? variantPriceText(item).text : EGYPT_UNAVAILABLE, sdgText: bookable ? variantSdgText(item) : "" };
  });
}

// The price line of a variant card: its own fixed price and unit, or that the
// agency prices it after review. Never a price the agency did not set.
export function variantPriceText(item) {
  const pricing = fixedPricing(item);
  if (!pricing) return { text: "يُحدَّد السعر بعد مراجعة الطلب", fixed: false };
  const unit = pricing.priceUnit === "PER_TRAVELER" ? "للمسافر" : "للطلب";
  return { text: `${moneyText(pricing.unitPrice, pricing.currency)} ${unit}`, fixed: true, currency: pricing.currency };
}

// The variant's SDG line: the server's own conversion (priceSdg, from the
// agency's active rate), or the notice that none is available. Never computed here.
export function variantSdgText(item) {
  const price = startingPrice(item);
  if (!price || price.currency === "SDG") return "";
  return sdgText(price) || SDG_UNAVAILABLE_NOTICE;
}

// SELECT requirement options as {value, label}: the API stores objects
// ({value, label}); older data may hold plain strings.
export function selectOptions(options) {
  const list = Array.isArray(options) ? options : Object.keys(options || {});
  return list
    .map((option) => (option && typeof option === "object" ? { value: String(option.value ?? ""), label: String(option.label ?? option.value ?? "") } : { value: String(option), label: String(option) }))
    .filter((option) => option.value);
}

// The entry method a variant stands for (null for the original item).
export function egyptVariantEntryMode(item) {
  return EGYPT_VARIANTS.find((variant) => variant.code === String(item?.code || "").toUpperCase())?.entryMode || null;
}

// The trip route of a variant request, editable (backend resolveEgyptRoute):
// by air from Port Sudan to Cairo airport by default, over land the entry point.
export const EGYPT_AIR_ROUTE_DEFAULTS = Object.freeze({ departureCity: "بورتسودان", arrivalAirport: "القاهرة" });

export function validateEgyptRoute(entryMode, { departureCity, arrivalAirport, entryPort } = {}) {
  if (entryMode === "AIR") {
    return String(departureCity || "").trim() && String(arrivalAirport || "").trim() ? [] : ["أدخل جهة القدوم ومطار الوصول."];
  }
  if (entryMode === "BORDER") return String(entryPort || "").trim() ? [] : ["أدخل منفذ الدخول."];
  return [];
}
