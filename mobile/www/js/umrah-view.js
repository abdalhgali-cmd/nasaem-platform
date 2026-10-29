// Umrah package details and contacts (issue #99). Pure, unit-tested without
// a DOM. Mirrors backend umrah/umrah-packages.js and web/src/lib/umrah-package.ts.
import { fixedPricing, moneyText } from "./pricing-view.js";
import { startingPrice, sdgText, sdgUnavailable, SDG_UNAVAILABLE_NOTICE } from "./service-view.js";

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

// Keep comparison cards scannable on a phone. Complete source arrays remain
// available to the request flow; the chooser shows the first useful facts and
// reports how many remain instead of becoming a wall of text.
export function umrahPackageSummary(item, { includedLimit = 3, excludedLimit = 2 } = {}) {
  const details = umrahPackageDetails(item);
  return {
    ...details,
    included: details.included.slice(0, includedLimit),
    excluded: details.excluded.slice(0, excludedLimit),
    moreIncluded: Math.max(0, details.included.length - includedLimit),
    moreExcluded: Math.max(0, details.excluded.length - excludedLimit),
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

// Umrah is booked only at a fixed price: a package without one is unavailable.
export const UMRAH_UNAVAILABLE = "غير متاحة للحجز حاليًا";
// A published package whose fixed price the agency has not set yet.
export const UMRAH_PRICE_MISSING = "لم تُحدِّد الوكالة سعر هذه الباقة بعد";

// What the Umrah screen shows after loading the packages, kept apart so a
// network or server problem is never reported as "not bookable":
//   NETWORK     — no connection / timeout (retry)
//   API_ERROR   — the server answered with an error (retry)
//   NONE        — the server answered: no Umrah package is published
//   UNPRICED    — packages are published, none has a fixed price yet
//   READY       — at least one package can be booked
export function umrahLoadState({ error = null, packages = [] } = {}) {
  if (error) {
    if (error.offline || !error.status) {
      return { kind: "NETWORK", retry: true, message: error.message || "تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى." };
    }
    return { kind: "API_ERROR", retry: true, message: `تعذر تحميل باقات العمرة من الخادم (رمز ${error.status}). أعد المحاولة بعد قليل.` };
  }
  if (!packages.length) return { kind: "NONE", retry: false, message: "لا توجد باقات عمرة منشورة حاليًا." };
  if (!packages.some((pkg) => umrahPriceText(pkg))) {
    return { kind: "UNPRICED", retry: false, message: "باقات العمرة منشورة، لكن الوكالة لم تُحدِّد أسعارها الثابتة بعد؛ لذلك لا يمكن حجزها حاليًا." };
  }
  return { kind: "READY", retry: false, message: "" };
}

// One line per Umrah kind the agency has published, in UMRAH_KIND_ORDER: the
// lowest fixed price of that kind ("من" when several packages share it) and
// that package's id (the home screen opens it directly). A kind with no
// published package is left out; one without a fixed price is not bookable
// (priceText null, packageId null). The SDG line is the server's own
// conversion — never an estimate.
export function umrahKindOffers(packages) {
  const list = (Array.isArray(packages) ? packages : []).filter(isUmrahPackage);
  return UMRAH_KIND_ORDER.map((kind) => {
    const ofKind = list.filter((pkg) => umrahPackageDetails(pkg).kind === kind);
    if (!ofKind.length) return null;
    const priced = ofKind.filter((pkg) => fixedPricing(pkg)).map((pkg) => ({ pkg, price: startingPrice(pkg) })).filter((entry) => entry.price);
    // Only like-for-like amounts are compared (same currency and billing unit,
    // per pilgrim vs per request); the first priced package sets the basis.
    const unit = (pkg) => (pkg.priceUnit === "PER_TRAVELER" ? "PER_TRAVELER" : "PER_REQUEST");
    const basis = priced[0];
    const comparable = priced.filter((entry) => entry.price.currency === basis?.price.currency && unit(entry.pkg) === unit(basis.pkg));
    const cheapest = comparable.reduce((best, entry) => (!best || entry.price.amount < best.price.amount ? entry : best), null);
    if (!cheapest) return { kind, label: UMRAH_KIND_LABELS[kind], priceText: null, sdgText: "", packageId: null, packageCount: ofKind.length };
    const fixed = umrahPriceText(cheapest.pkg);
    const sdg = sdgText(cheapest.price) || (sdgUnavailable(cheapest.price) ? SDG_UNAVAILABLE_NOTICE : "");
    return {
      kind,
      label: UMRAH_KIND_LABELS[kind],
      priceText: `${comparable.length > 1 ? "من " : ""}${fixed}`,
      sdgText: sdg,
      packageId: cheapest.pkg.id,
      packageCount: ofKind.length,
    };
  }).filter(Boolean);
}

// Same rule as the server: an Umrah service or package request (not a visa type).
export function umrahNeedsGuarantor(item) {
  return Boolean(item) && !item.isVisaType && UMRAH_CATEGORIES.includes(String(item.category || ""));
}

// Umrah with flight or sea services needs a preferred travel date; visa only:
// optional. Provisional, not a booking (server: umrah-packages.js
// resolveUmrahTravel).
export function umrahTravelDateRequired(item) {
  const kind = umrahPackageDetails(item).kind;
  return umrahNeedsGuarantor(item) && (kind === "AIR" || kind === "SEA");
}

export const UMRAH_TRAVEL_DATE_NOTE = "تاريخ مبدئي وليس حجزًا مؤكدًا؛ تؤكد الوكالة الموعد لاحقًا.";

export function validateUmrahTravelDate(value, required, today = new Date().toISOString().slice(0, 10)) {
  const date = String(value || "").trim();
  if (!date) return required ? ["حدّد تاريخ السفر المفضل لهذه الباقة."] : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ["تاريخ السفر المفضل غير صحيح."];
  if (date < today) return ["تاريخ السفر المفضل في الماضي. اختر تاريخًا قادمًا."];
  return [];
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
