import { fixedPricing } from "./pricing-view.js";

// Presentation rules for services (home shortcuts, services list, service
// details). Pure functions, no DOM: unit-tested in tests/service-view.test.mjs.
// Everything shown comes from the catalog the agency publishes (prices, text,
// durations). The owner expanded the directory on 2026-11-10: published
// services have their own routes and linked visa checklists.

export const SHORTCUTS = Object.freeze([
  { key: "umrah", label: "عمرة", icon: "umrah", codes: ["VISA-UMRAH", "SVC-UMRAH"] },
  { key: "egypt", label: "موافقة أمنية لمصر", icon: "shield-check", codes: ["VISA-EGYPT-CLEARANCE", "SVC-EGYPT-CLEARANCE"] },
  { key: "flights", label: "تذاكر الطيران", icon: "plane", codes: ["SVC-FLIGHT"] },
  { key: "ferries", label: "حجز العبارات", icon: "ship", codes: ["SVC-FERRY"] },
  { key: "visas", label: "التأشيرات", icon: "visa", hub: true },
  { key: "tasheel", label: "مواعيد تساهيل", icon: "calendar", codes: ["SVC-TASHEEL"] },
]);

function allItems(catalog) {
  return [...(catalog?.services || []), ...(catalog?.visaTypes || [])];
}

export const VISAS_HUB_ITEM = Object.freeze({
  id: "HUB-VISAS",
  code: "HUB-VISAS",
  name: "التأشيرات",
  category: "visa",
  description: "اختر نوع التأشيرة واطّلع على متطلباتها قبل بدء الطلب.",
});

// The public API intentionally returns Service and VisaType as separate
// resources. Several visa types point back to an already-visible Service,
// so concatenating both arrays makes Umrah, family visit and Egypt clearance
// appear twice. The directory keeps one entry per customer journey: every
// top-level Service plus one visas hub whose next screen lists VisaTypes.
// The visa types listed under «التأشيرات». Umrah is its own section (the
// Umrah shortcut and screen), never a visa in this list.
export function hubVisaTypes(catalog) {
  return (catalog?.visaTypes || []).filter(visaType => visaType.active !== false && !isUmrahReleaseItem(visaType) && !isEgyptReleaseItem(visaType) && String(visaType.category || "").toUpperCase() !== "UMRAH");
}

// Hotel discovery is postponed by agency decision; existing cases and
// backend routes remain readable and untouched.
// (Owner decision 2026-11-11: still postponed after the directory was widened.)
export const isPostponedHotel = (item) => String(item?.code || "").toUpperCase() === "SVC-HOTEL";

const isUmrahReleaseItem = (item) => {
  const code = String(item?.code || "").toUpperCase();
  return code === "SVC-UMRAH" || code === "VISA-UMRAH";
};

const isEgyptReleaseItem = (item) => {
  const code = String(item?.code || "").toUpperCase();
  return code.startsWith("VISA-EGYPT-CLEARANCE") || code === "SVC-EGYPT-CLEARANCE";
};

// One published customer journey per service. A VisaType supplies its own
// requirements rather than incorrectly fetching the parent Service checklist.
function publishedEntries(catalog) {
  const services = (catalog?.services || []).filter(item => item.active !== false && !isPostponedHotel(item) && !["PACKAGE", "UMRAH_PACKAGE"].includes(String(item.category || "").toUpperCase()) && !String(item.code || "").startsWith("SVC-UMRAH-"));
  const visas = (catalog?.visaTypes || []).filter(item => item.active !== false && !/^VISA-EGYPT-CLEARANCE-(AIR|BORDER)$/.test(item.code || ""));
  const out = services.map(service => {
    if (isUmrahReleaseItem(service)) return service;
    return visas.find(visa => visa.serviceId === service.id || visa.code === String(service.code || "").replace(/^SVC-/, "VISA-")) || service;
  });
  for (const visa of visas) {
    if (out.some(item => item.id === visa.id || (visa.serviceId && item.id === visa.serviceId) || (isUmrahReleaseItem(item) && isUmrahReleaseItem(visa)) || (isEgyptReleaseItem(item) && isEgyptReleaseItem(visa)))) continue;
    out.push(visa);
  }
  return [...new Map(out.map(item => [item.id || item.code, item])).values()];
}

export function serviceDirectoryItems(catalog) { return publishedEntries(catalog); }

export function groupServiceDirectory(catalog) {
  const groups = [
    { key: "umrah", title: "العمرة", items: [] },
    { key: "egypt", title: "الموافقة الأمنية لمصر", items: [] },
    { key: "travel", title: "السفر والإقامة", items: [] },
    { key: "visas", title: "التأشيرات والمواعيد", items: [] },
    { key: "other", title: "خدمات أخرى", items: [] },
  ];
  for (const item of publishedEntries(catalog)) {
    const code = String(item.code || "").toUpperCase();
    const at = isUmrahReleaseItem(item) ? 0 : isEgyptReleaseItem(item) ? 1 : /FLIGHT|FERRY|HOTEL/.test(code) ? 2 : /VISA|TASHEEL/.test(code) ? 3 : 4;
    groups[at].items.push(item);
  }
  return groups.filter(group => group.items.length > 0);
}

// Only shortcuts whose service is actually published are returned: a shortcut
// never leads to a service the agency has switched off.
export function resolveShortcuts(catalog) {
  const items = allItems(catalog);
  const out = [];
  for (const shortcut of SHORTCUTS) {
    if (shortcut.hub) {
      if (hubVisaTypes(catalog).length) out.push({ ...shortcut });
      continue;
    }
    const item = shortcut.codes.map((code) => items.find((candidate) => (candidate.code || "").toUpperCase() === code)).find(Boolean)
      || (shortcut.key === "egypt" ? items.find(isEgyptReleaseItem) : null);
    if (item) out.push({ ...shortcut, item });
  }
  return out;
}

// Distinct services a customer can request, for «كل الخدمات (N)»: every
// published Service (postponed hotels excluded) plus any visa type that has no
// Service of its own. A visa type linked to a listed Service (serviceId) is the
// same journey and is not counted twice. Umrah visa types belong to Umrah:
// they add one journey only when no Umrah Service is published.
export function publishedServiceCount(catalog) {
  return publishedEntries(catalog).length;
}

// "خدمة واحدة" / "خدمتان" / "3 خدمات" / "11 خدمة" — Arabic number agreement.
export function serviceCountText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 1) return "خدمة واحدة";
  if (n === 2) return "خدمتان";
  if (n >= 3 && n <= 10) return `${n} خدمات`;
  return `${n} خدمة`;
}

// Home bento, in priority order after the Umrah feature tile. Only published
// services appear (resolveShortcuts); hotels are not offered.
export const HOME_BENTO_KEYS = Object.freeze(["egypt", "flights", "ferries", "visas"]);

export function homeBentoTiles(catalog) {
  const shortcuts = resolveShortcuts(catalog);
  return HOME_BENTO_KEYS.map((key) => shortcuts.find((shortcut) => shortcut.key === key)).filter(Boolean);
}

export function startingPrice(item) {
  const amount = Number(item?.basePrice);
  if (!(amount > 0)) return null;
  const currency = item.currency || "SAR";
  const priceSdg = currency === "SDG" ? null : Number(item.priceSdg) > 0 ? Number(item.priceSdg) : null;
  return { amount, currency, priceSdg };
}

const NUMBER = new Intl.NumberFormat("ar", { maximumFractionDigits: 2 });

export function priceText(price) {
  return price ? `${NUMBER.format(price.amount)} ${price.currency}` : "";
}

export function sdgText(price) {
  return price?.priceSdg ? `≈ ${NUMBER.format(price.priceSdg)} SDG` : "";
}

// Shown instead of a conversion when the agency has no active exchange rate for
// the price's currency: only the original price is displayed, with this notice.
export const SDG_UNAVAILABLE_NOTICE = "المقابل بالجنيه السوداني غير متاح حاليًا";

export function sdgUnavailable(price) {
  return Boolean(price) && price.currency !== "SDG" && !(price.priceSdg > 0);
}

export function durationOf(item) {
  const value = String(item?.processingTime || "").trim();
  return value || null;
}

export function shortDescription(item, max = 110) {
  const text = String(item?.description || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Services with an announced price, in the agency's own order, for the home
// "featured" strip. Visa types are included only when they carry a price too.
export function featuredServices(catalog, limit = 4) {
  return allItems(catalog)
    .filter((item) => startingPrice(item))
    .slice(0, limit);
}

// Home shortcuts already expose the principal journeys and the visas hub.
// "Featured" therefore uses only other priced Service records: no duplicate
// shortcut cards and no individual VisaType duplicated outside its hub.
// An Umrah package (umrah-view.js isUmrahPackage, repeated here to keep this
// module free of imports from it): booked only through the Umrah chooser.
const isUmrahPackageItem = (item) =>
  String(item?.category || "").toUpperCase() === "UMRAH_PACKAGE" || String(item?.code || "").toUpperCase().startsWith("SVC-UMRAH-");

export function homeFeaturedServices(catalog, shortcuts = resolveShortcuts(catalog), limit = 4) {
  return [];
}

// "What you will need": the agency's own requirements, split into documents
// and information, required ones first.
export function groupRequirements(requirements = []) {
  const active = requirements.filter((requirement) => requirement && requirement.active !== false);
  const byOrder = (a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  const documents = active.filter((requirement) => (requirement.type || "DOCUMENT") === "DOCUMENT").sort(byOrder);
  const information = active.filter((requirement) => (requirement.type || "DOCUMENT") !== "DOCUMENT").sort(byOrder);
  return { documents, information };
}

export const REQUEST_STEPS = Object.freeze([
  { title: "قدّم طلبك", text: "أدخل بياناتك وبيانات المسافرين وارفع المستندات المطلوبة." },
  { title: "تراجع الوكالة طلبك", text: "يتحقق الفريق من البيانات والمستندات ويراسلك إن لزم تعديل." },
  { title: "السعر والدفع", text: "يصلك السعر النهائي، وبعد موافقتك تظهر لك حسابات الدفع المعتمدة." },
  { title: "المتابعة والتسليم", text: "تتابع الحالة برقم طلبك حتى تُسلَّم لك النتيجة." },
]);

export const FINAL_PRICE_NOTE =
  "السعر المعروض هو السعر المبدئي المعلن. السعر النهائي وتعليمات الدفع تظهر لك بعد أن تراجع الوكالة طلبك.";

// A fixed-price service (pricingMode FIXED with a positive price, set by the
// agency): the price is final, so there is no quote and no approval step.
export const FIXED_REQUEST_STEPS = Object.freeze([
  { title: "اختر الخدمة", text: "السعر ثابت ومعلن قبل أن تبدأ." },
  { title: "المتطلبات", text: "ارفع الجوازات والمستندات المطلوبة وأكّد الإجمالي." },
  { title: "الدفع", text: "حوّل المبلغ إلى الحساب المعتمد وارفع إشعار التحويل." },
  { title: "المتابعة", text: "تتابع طلبك حتى الإصدار والتسليم." },
]);

export const FIXED_PRICE_NOTE = "سعر ثابت: لا عرض سعر ولا موافقة لاحقة، وتدفع المبلغ نفسه.";

export function requestSteps(item) {
  return fixedPricing(item) ? FIXED_REQUEST_STEPS : REQUEST_STEPS;
}

export function priceNote(item) {
  return fixedPricing(item) ? FIXED_PRICE_NOTE : FINAL_PRICE_NOTE;
}
