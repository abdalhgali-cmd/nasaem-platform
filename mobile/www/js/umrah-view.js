// Umrah package details and contacts (issue #99). Pure, unit-tested without
// a DOM. Mirrors backend umrah/umrah-packages.js and web/src/lib/umrah-package.ts.
import { fixedPricing, moneyText } from "./pricing-view.js";
import { startingPrice, priceText, sdgText, sdgUnavailable, SDG_UNAVAILABLE_NOTICE } from "./service-view.js";

export const UMRAH_KIND_LABELS = Object.freeze({
  VISA_ONLY: "تأشيرة فقط",
  AIR: "مع خدمات الطيران",
  SEA: "مع خدمات البحر",
});

const UMRAH_CATEGORIES = ["umrah", "UMRAH_PACKAGE", "umrah_package"];

function entries(features, prefix) {
  return (Array.isArray(features) ? features : [])
    .filter((feature) => typeof feature === "string" && feature.startsWith(`${prefix}:`))
    .map((feature) => feature.slice(prefix.length + 1).trim())
    .filter(Boolean);
}

export function umrahPackageDetails(item) {
  const kind = String(entries(item?.features, "KIND")[0] || "").toUpperCase();
  return {
    kind: UMRAH_KIND_LABELS[kind] ? kind : null,
    kindLabel: UMRAH_KIND_LABELS[kind] || "",
    included: entries(item?.features, "INCLUDED"),
    excluded: entries(item?.features, "EXCLUDED"),
  };
}

// The price line of a package card: the exact fixed price (per pilgrim or per
// request), otherwise null (the card says the agency prices it after review).
export function umrahPriceText(item) {
  const pricing = fixedPricing(item);
  if (!pricing) return null;
  return `${moneyText(pricing.unitPrice, pricing.currency)} ${pricing.priceUnit === "PER_TRAVELER" ? "للمعتمر" : "للطلب"}`;
}

// A published Umrah package from /services/public/packages (the Umrah screen's rule).
export function isUmrahPackage(pkg) {
  return String(pkg?.category || "").toUpperCase() === "UMRAH_PACKAGE" ||
    String(pkg?.code || "").toUpperCase().startsWith("SVC-UMRAH-");
}

export const UMRAH_KIND_ORDER = Object.freeze(["VISA_ONLY", "AIR", "SEA"]);

// One line per Umrah kind the agency has published, in UMRAH_KIND_ORDER: the
// lowest published price of that kind ("من" when several packages share it).
// A kind with no published package is left out, an unpriced one says so, and
// the SDG line is the server's own conversion — never an estimate.
export function umrahKindOffers(packages) {
  const list = (Array.isArray(packages) ? packages : []).filter(isUmrahPackage);
  return UMRAH_KIND_ORDER.map((kind) => {
    const ofKind = list.filter((pkg) => umrahPackageDetails(pkg).kind === kind);
    if (!ofKind.length) return null;
    const priced = ofKind.map((pkg) => ({ pkg, price: startingPrice(pkg) })).filter((entry) => entry.price);
    // Only like-for-like amounts are compared (same currency and billing unit,
    // per pilgrim vs per request); the first priced package sets the basis.
    const unit = (pkg) => (pkg.priceUnit === "PER_TRAVELER" ? "PER_TRAVELER" : "PER_REQUEST");
    const basis = priced[0];
    const comparable = priced.filter((entry) => entry.price.currency === basis?.price.currency && unit(entry.pkg) === unit(basis.pkg));
    const cheapest = comparable.reduce((best, entry) => (!best || entry.price.amount < best.price.amount ? entry : best), null);
    if (!cheapest) return { kind, label: UMRAH_KIND_LABELS[kind], priceText: null, sdgText: "", packageCount: ofKind.length };
    const fixed = umrahPriceText(cheapest.pkg);
    const sdg = sdgText(cheapest.price) || (fixed && sdgUnavailable(cheapest.price) ? SDG_UNAVAILABLE_NOTICE : "");
    return {
      kind,
      label: UMRAH_KIND_LABELS[kind],
      priceText: `${comparable.length > 1 ? "من " : ""}${fixed || priceText(cheapest.price)}`,
      sdgText: sdg,
      packageCount: ofKind.length,
    };
  }).filter(Boolean);
}

// Same rule as the server: an Umrah service or package request (not a visa type).
export function umrahNeedsGuarantor(item) {
  return Boolean(item) && !item.isVisaType && UMRAH_CATEGORIES.includes(String(item.category || ""));
}

const PHONE = /^\+?[0-9][0-9\s-]{5,19}$/;

export function isContactPhone(value) {
  return PHONE.test(String(value || "").trim());
}

export function validateUmrahContacts({ guarantorPhone, extraContactName, extraContactPhone } = {}) {
  const messages = [];
  if (!isContactPhone(guarantorPhone)) messages.push("أدخل رقم هاتف الضامن.");
  const name = String(extraContactName || "").trim();
  const phone = String(extraContactPhone || "").trim();
  if ((name || phone) && !isContactPhone(phone)) messages.push("أدخل رقم هاتف صحيحًا لجهة الاتصال الإضافية أو اترك الحقلين فارغين.");
  return messages;
}
