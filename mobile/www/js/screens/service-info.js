// Service details: what the service is, the announced price (original
// currency first, Sudanese-pound equivalent when the agency's rate is set),
// how long it takes, what the customer will need, the steps, and a fixed
// "start the request" button. The request form itself lives in the dedicated
// screens (resolveServiceScreen); this page only informs and hands over.
import { api } from "../api.js";
import { esc, errorState } from "../ui.js";
import { icon, iconForService } from "../icons.js";
import { go } from "../router.js";
import { cachedCatalog, resolveServiceScreen } from "../catalog.js";
import { egyptVariantOptions, isEgyptClearanceItem } from "../egypt-view.js";
import {
  startingPrice,
  priceText,
  sdgText,
  sdgUnavailable,
  SDG_UNAVAILABLE_NOTICE,
  durationOf,
  groupRequirements,
  requestSteps,
  priceNote,
  FIXED_REQUEST_STEPS,
} from "../service-view.js";
import { fixedPricing } from "../pricing-view.js";

const START_TITLES = {
  umrah: "العمرة",
  flights: "تذاكر الطيران",
  ferries: "حجوزات البواخر",
  hotels: "حجز الفنادق",
  egyptClearance: "الموافقة الأمنية لمصر",
  saudiFamilyVisit: "الزيارة العائلية",
};

// Every Egypt variant is booked only at its own fixed price (egypt-view.js).
const FIXED_PRICE_NOTE_VARIANTS = "سعر ثابت لكل طريقة دخول: لا عرض سعر ولا موافقة لاحقة.";

export function startRequest(item) {
  const screen = resolveServiceScreen(item);
  go(screen, { item }, { title: START_TITLES[screen] || item.name, tab: "services" });
}

async function fetchRequirements(item) {
  const scope = item.isVisaType ? "visa-types" : "services";
  const res = await api(`/${scope}/${item.id}/requirements/public`);
  return Array.isArray(res.data) ? res.data : [];
}

function requirementsBlock(groups) {
  const row = (requirement) =>
    `<li><span class="need-mark">${icon(requirement.required ? "check" : "plus", { size: 14 })}</span><span>${esc(requirement.name)}${requirement.required ? "" : ' <small>(اختياري)</small>'}</span></li>`;
  if (!groups.documents.length && !groups.information.length) return "";
  return `
    <section class="info-card">
      <h3>${icon("document", { size: 18 })} ما الذي ستحتاجه</h3>
      ${groups.documents.length ? `<h4>المستندات</h4><ul class="need-list">${groups.documents.map(row).join("")}</ul>` : ""}
      ${groups.information.length ? `<h4>بيانات تُطلب منك</h4><ul class="need-list">${groups.information.map(row).join("")}</ul>` : ""}
    </section>`;
}

export async function renderServiceInfoScreen({ bodyEl, setTitle, params }) {
  const { item } = params;
  setTitle?.(item.name);
  // Egypt clearance with published variants: each variant's own price, never
  // the original item's single price (it applies to neither variant).
  const variants = isEgyptClearanceItem(item) ? egyptVariantOptions(cachedCatalog()) : [];
  const price = variants.length ? null : startingPrice(item);
  // A fixed price is the exact amount (no «من»); a quoted one is a starting price.
  const fixed = !variants.length && Boolean(fixedPricing(item));
  const duration = durationOf(item);
  const features = Array.isArray(item.features) ? item.features.filter((feature) => typeof feature === "string" && feature.trim()) : [];

  bodyEl.innerHTML = `
    <div class="info-page">
      <section class="info-hero">
        <span class="info-hero-icon">${icon(iconForService(item), { size: 34 })}</span>
        <h2>${esc(item.name)}</h2>
        ${item.country ? `<span class="info-country">${esc(item.country)}</span>` : ""}
        <p>${esc(item.description || "خدمة متاحة عبر نسائم الحرمين، يتابعها فريقنا من تقديم الطلب حتى التسليم.")}</p>
      </section>

      <section class="info-facts">
        <div class="info-fact">
          <small>السعر المعلن</small>
          ${variants.length ? `<ul class="variant-prices" id="egyptVariantPrices">${variants.map((variant) => `<li><span>${esc(variant.name)}</span> <strong><bdi>${esc(variant.priceText)}</bdi>${variant.sdgText ? `<small><bdi>${esc(variant.sdgText)}</bdi></small>` : ""}</strong></li>`).join("")}</ul>` : price ? `<strong>${fixed ? "" : "من "}<bdi>${esc(priceText(price))}</bdi></strong>${sdgText(price) ? `<span><bdi>${esc(sdgText(price))}</bdi></span>` : sdgUnavailable(price) ? `<span>${esc(SDG_UNAVAILABLE_NOTICE)}</span>` : ""}` : `<strong>يُحدد بعد مراجعة طلبك</strong>`}
        </div>
        <div class="info-fact">
          <small>مدة الإنجاز</small>
          <strong>${duration ? esc(duration) : "تُحدد حسب الحالة"}</strong>
        </div>
      </section>
      <p class="info-note">${icon("info", { size: 15 })} ${esc(variants.length ? FIXED_PRICE_NOTE_VARIANTS : priceNote(item))}</p>

      ${features.length ? `<section class="info-card"><h3>${icon("star", { size: 18 })} ماذا تشمل الخدمة</h3><ul class="need-list">${features.map((feature) => `<li><span class="need-mark">${icon("check", { size: 14 })}</span><span>${esc(feature)}</span></li>`).join("")}</ul></section>` : ""}

      <div id="needsMount"><div class="skeleton-row"></div></div>

      <section class="info-card">
        <h3>${icon("requests", { size: 18 })} خطوات الطلب</h3>
        <ol class="flow-steps">
          ${(variants.length ? FIXED_REQUEST_STEPS : requestSteps(item)).map((step, index) => `<li><span class="flow-dot">${index + 1}</span><div><b>${esc(step.title)}</b><p>${esc(step.text)}</p></div></li>`).join("")}
        </ol>
      </section>
    </div>
    <div class="sticky-cta"><button class="primary" id="startRequestBtn">ابدأ الطلب الآن</button></div>`;

  bodyEl.querySelector("#startRequestBtn").addEventListener("click", () => startRequest(item));

  const mount = bodyEl.querySelector("#needsMount");
  try {
    mount.innerHTML = requirementsBlock(groupRequirements(await fetchRequirements(item)));
  } catch (error) {
    // The page is still useful without the checklist; the form itself lists
    // every requirement before anything is sent.
    mount.innerHTML = errorState("تعذر تحميل قائمة المتطلبات الآن. ستظهر كاملة في نموذج الطلب.");
  }
}
