// Presentation rules for services (home shortcuts, services list, service
// details). Pure functions, no DOM: unit-tested in tests/service-view.test.mjs.
// Everything shown comes from the catalog the agency publishes (prices, text,
// durations); nothing is hard-coded here except which catalog codes the six
// home shortcuts point at.

export const SHORTCUTS = Object.freeze([
  { key: "umrah", label: "عمرة", icon: "umrah", codes: ["VISA-UMRAH", "SVC-UMRAH"] },
  { key: "visas", label: "تأشيرات", icon: "visa", hub: true },
  { key: "flights", label: "طيران", icon: "flight", codes: ["SVC-FLIGHT"] },
  { key: "ferries", label: "بواخر", icon: "ferry", codes: ["SVC-FERRY"] },
  { key: "egypt", label: "موافقة أمنية لمصر", icon: "shield-check", codes: ["VISA-EGYPT-CLEARANCE", "SVC-EGYPT-CLEARANCE"] },
  { key: "family", label: "زيارة عائلية", icon: "user", codes: ["VISA-FAMILY-VISIT", "SVC-FAMILY-VISIT"] },
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
  return (catalog?.visaTypes || []).filter((visaType) => String(visaType.category || "").toUpperCase() !== "UMRAH");
}

// Hotel discovery is postponed by agency decision; existing cases and
// backend routes remain readable and untouched.
export const isPostponedHotel = (item) => String(item?.code || "").toUpperCase() === "SVC-HOTEL";

export function serviceDirectoryItems(catalog) {
  const services = (catalog?.services || []).filter((item) => !isPostponedHotel(item));
  return hubVisaTypes(catalog).length ? [VISAS_HUB_ITEM, ...services] : [...services];
}

// A compact, catalog-backed directory. Categories are presentation only: the
// same item ids go through the existing service router and priced intake.
export function groupServiceDirectory(catalog) {
  const items = serviceDirectoryItems(catalog);
  const groups = [
    { key: "umrah", title: "العمرة", items: [] },
    { key: "travel", title: "السفر", items: [] },
    { key: "visas", title: "التأشيرات والموافقات", items: [] },
    { key: "other", title: "خدمات أخرى", items: [] },
  ];
  for (const item of items) {
    const code = String(item?.code || "").toUpperCase();
    if (code.includes("UMRAH")) groups[0].items.push(item);
    else if (code === "SVC-FLIGHT" || code === "SVC-FERRY" || /^(FLIGHT|FERRY)$/.test(code)) groups[1].items.push(item);
    else if (code === "HUB-VISAS" || code.startsWith("VISA-") || /VISA|EGYPT|CLEARANCE|VISIT/.test(code)) groups[2].items.push(item);
    else groups[3].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
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
    const item = shortcut.codes.map((code) => items.find((candidate) => (candidate.code || "").toUpperCase() === code)).find(Boolean);
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
  const services = (catalog?.services || []).filter((item) => !isPostponedHotel(item));
  const ids = new Set(services.map((item) => item.id));
  const unlinked = hubVisaTypes(catalog).filter((visaType) => !(visaType.serviceId && ids.has(visaType.serviceId)));
  const umrahService = services.some((item) => String(item.code || "").toUpperCase().includes("UMRAH"));
  const umrahVisaOnly = !umrahService && (catalog?.visaTypes || []).some((visaType) => String(visaType.category || "").toUpperCase() === "UMRAH");
  return services.length + unlinked.length + (umrahVisaOnly ? 1 : 0);
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
export const HOME_BENTO_KEYS = Object.freeze(["flights", "ferries", "visas", "egypt", "family"]);

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
export function homeFeaturedServices(catalog, shortcuts = resolveShortcuts(catalog), limit = 4) {
  const shortcutIds = new Set(shortcuts.map((shortcut) => shortcut.item?.id).filter(Boolean));
  const shortcutCodes = new Set(
    shortcuts.flatMap((shortcut) => shortcut.codes || []).map((code) => code.toUpperCase())
  );
  return featuredServices({ services: catalog?.services || [], visaTypes: [] }, Number.MAX_SAFE_INTEGER)
    .filter((item) => !isPostponedHotel(item) && !shortcutIds.has(item.id) && !shortcutCodes.has((item.code || "").toUpperCase()))
    .slice(0, limit);
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
