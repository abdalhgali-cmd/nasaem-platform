import { api } from "./api.js";

const CATALOG_CACHE_KEY = "nasaem.catalog.cache.v3";

let memoryCatalog = null;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Non-fatal — the app just re-fetches next time instead of using a cache.
  }
}

// Serves the last-known catalog instantly (if any), then refreshes from
// the network in the background. Callers that only need "do we have
// something to show right now" pass fresh:false; screens that must reflect
// a confirmed server state (e.g. after creating an order) pass fresh:true.
export async function loadCatalog({ fresh = false } = {}) {
  if (!fresh && memoryCatalog) return memoryCatalog;
  if (!fresh) {
    const cached = readCache();
    if (cached) memoryCatalog = cached;
  }

  let res;
  try {
    res = await api("/services/public");
  } catch (error) {
    // Offline / server down: the last saved catalog, marked as possibly
    // outdated (screens say so). Without a saved copy, the error stands.
    const saved = memoryCatalog || readCache();
    if (saved) return { ...saved, stale: true };
    throw error;
  }
  // Tagged once, here, at the source — every downstream screen (intake.js's
  // requirement-scope lookup especially) reads `isVisaType` instead of
  // re-guessing it from `category`, which is NOT a reliable discriminator:
  // a VisaType's category is an enum like UMRAH/FAMILY_VISIT/OTHER, never
  // the literal string "visa".
  const data = {
    services: (res.data?.services || []).map((service) => ({ ...service, isVisaType: false })),
    visaTypes: (res.data?.visaTypes || []).map((visaType) => ({ ...visaType, isVisaType: true })),
  };
  memoryCatalog = data;
  writeCache(data);
  return data;
}

export function cachedCatalog() {
  return memoryCatalog || readCache();
}

export async function loadPackages() {
  const res = await api("/services/public/packages");
  return (res.data || []).map((pkg) => ({ ...pkg, isVisaType: false }));
}

export async function loadHomepage() {
  const res = await api("/homepage/public");
  return res.data || { hero: null, sections: [] };
}

export async function loadPublicSettings() {
  const res = await api("/settings/public");
  const rows = res.data || [];
  const byKey = {};
  for (const row of rows) byKey[row.key] = row.value;
  return byKey;
}

export function parseFaq(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Mirrors web/src/lib/service-routes.ts's resolveServiceHref — same
// dedicated-vs-generic decision, expressed as a mobile screen name instead
// of a URL. Keeping this logic in one place (not duplicated per screen)
// matches the backend's requirement engine already being the single
// source of truth for what fields a given service needs.
export function resolveServiceScreen(item) {
  const code = (item.code || "").toUpperCase();
  const category = (item.category || "").toLowerCase();

  if (code === "SVC-EGYPT-CLEARANCE" || code === "VISA-EGYPT-CLEARANCE") return "egyptClearance";
  if (code === "SVC-FAMILY-VISIT" || code === "VISA-FAMILY-VISIT") return "saudiFamilyVisit";
  if (code === "VISA-UMRAH" || category === "umrah") return "umrah";
  if (category.includes("ferry")) return "ferries";
  if (category.includes("flight")) return "flights";
  if (category.includes("hotel")) return "hotels";
  if (category === "package") return "umrah";

  return "serviceDetail";
}
