// Umrah package details and contacts (issue #99). Pure, unit-tested without
// a DOM. Mirrors backend umrah/umrah-packages.js and web/src/lib/umrah-package.ts.
import { fixedPricing, moneyText } from "./pricing-view.js";

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
