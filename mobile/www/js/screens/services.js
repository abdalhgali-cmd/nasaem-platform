import { esc, skeletonGrid, errorState, emptyState } from "../ui.js";
import { icon, iconForService } from "../icons.js";
import { loadCatalog, resolveServiceScreen } from "../catalog.js";
import { go } from "../router.js";
import { renderIntakeScreen } from "./intake.js";

export const VISAS_HUB_CODE = "HUB-VISAS";

function findItemById(catalog, id) {
  return catalog.services.find((s) => s.id === id) || catalog.visaTypes.find((v) => v.id === id);
}

// The single dispatcher every service card in the app calls through — it
// decides, per item, whether a dedicated screen exists (Umrah, Flights,
// Hotels, Ferries, Egypt Security Approval, Saudi Family Visit) or falls
// back to the generic-but-requirement-driven detail screen. Mirrors
// web/src/lib/service-routes.ts's resolveServiceHref.
export async function openServiceById(id, catalogHint) {
  if (id === VISAS_HUB_CODE) {
    go("visasHub", {}, { title: "التأشيرات", tab: "home" });
    return;
  }
  let catalog = catalogHint;
  let item = catalog && findItemById(catalog, id);
  if (!item) {
    catalog = await loadCatalog();
    item = findItemById(catalog, id);
  }
  if (!item) return;
  openServiceItem(item);
}

export function openServiceItem(item) {
  const screen = resolveServiceScreen(item);
  const titleMap = {
    umrah: "العمرة",
    flights: "تذاكر الطيران",
    ferries: "حجوزات البواخر",
    hotels: "حجز الفنادق",
    egyptClearance: "الموافقة الأمنية لمصر",
    saudiFamilyVisit: "الزيارة العائلية",
    serviceDetail: item.name,
  };
  go(screen, { item }, { title: titleMap[screen] || item.name, tab: "home" });
}

export async function renderServicesScreen({ bodyEl }) {
  bodyEl.innerHTML = `<div class="services-grid">${skeletonGrid(9)}</div>`;
  try {
    const catalog = await loadCatalog();
    const items = [...catalog.services, ...catalog.visaTypes];
    if (!items.length) {
      bodyEl.innerHTML = emptyState({ icon: "inbox", title: "لا توجد خدمات منشورة حالياً" });
      return;
    }
    bodyEl.innerHTML = `
      <div class="services-grid services-grid-full">
        ${items.map((item) => `
          <button class="service-card" data-id="${esc(item.id)}">
            <span class="service-card-icon">${icon(iconForService(item), { size: 24 })}</span>
            <strong>${esc(item.name)}</strong>
          </button>`).join("")}
      </div>`;
    bodyEl.querySelectorAll(".service-card").forEach((card) => {
      card.addEventListener("click", () => openServiceById(card.dataset.id, catalog));
    });
  } catch (error) {
    bodyEl.innerHTML = errorState(error.message, { onRetry: () => renderServicesScreen({ bodyEl }) });
  }
}

export async function renderVisasHubScreen({ bodyEl }) {
  bodyEl.innerHTML = `<div class="services-grid">${skeletonGrid(6)}</div>`;
  try {
    const catalog = await loadCatalog();
    if (!catalog.visaTypes.length) {
      bodyEl.innerHTML = emptyState({ icon: "inbox", title: "لا توجد أنواع تأشيرات منشورة حالياً" });
      return;
    }
    bodyEl.innerHTML = `
      <p class="field-hint section-intro">اختر نوع التأشيرة لعرض المتطلبات والسعر وبدء الطلب.</p>
      <div class="package-list">
        ${catalog.visaTypes.map((visaType) => `
          <button class="package-card" data-id="${esc(visaType.id)}">
            <span class="service-card-icon">${icon(iconForService(visaType), { size: 22 })}</span>
            <div>
              <b>${esc(visaType.name)}</b>
              ${visaType.country ? `<span>${esc(visaType.country)}</span>` : ""}
            </div>
            <span class="chevron">${icon("chevron-start", { size: 16 })}</span>
          </button>`).join("")}
      </div>`;
    bodyEl.querySelectorAll(".package-card").forEach((card) => {
      card.addEventListener("click", () => {
        const visaType = catalog.visaTypes.find((v) => v.id === card.dataset.id);
        if (visaType) openServiceItem(visaType);
      });
    });
  } catch (error) {
    bodyEl.innerHTML = errorState(error.message, { onRetry: () => renderVisasHubScreen({ bodyEl }) });
  }
}

// Generic dedicated-service screen: a short hero + what's included + the
// real requirement-driven intake form. Used for every service/visa type
// that doesn't have a hand-built experience of its own (International
// Visa, Work Visa, Tasheel, a future catalog addition, ...).
export async function renderServiceDetailScreen({ bodyEl, setTitle, params }) {
  const { item } = params;
  setTitle(item.name);
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon(iconForService(item), { size: 36 })}</div>
      <h2>${esc(item.name)}</h2>
      <p>${esc(item.description || "خدمة متاحة عبر نسائم الحرمين، يتابعها فريقنا من الطلب حتى التسليم.")}</p>
    </div>
    <div id="intakeMount"></div>
  `;
  await renderIntakeScreen({ bodyEl: bodyEl.querySelector("#intakeMount"), setTitle: () => {}, item });
}
