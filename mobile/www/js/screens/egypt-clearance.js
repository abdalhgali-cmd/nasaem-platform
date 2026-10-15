import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { loadCatalog, loadPublicSettings, parseFaq } from "../catalog.js";
import { EGYPT_UNAVAILABLE, egyptVariantOptions } from "../egypt-view.js";
import { renderIntakeScreen } from "./intake.js";

// Egypt security approval (موافقة حربي). Order of the screen: the variant
// (entry method) with its configured price first, then the request form
// (travelers, documents, the confirmed total), and only then the help (FAQ,
// collapsed). A variant without a published fixed price is shown as
// unavailable; new bookings never fall back to the original item or a quote.
export async function renderEgyptClearanceScreen({ bodyEl, params }) {
  const { item } = params;
  bodyEl.innerHTML = `
    <div class="service-hero service-hero-egypt service-hero-compact">
      <div class="service-hero-icon">${icon("shield-check", { size: 30 })}</div>
      <h2>الموافقة الأمنية لمصر</h2>
      <p>اختر نوع الموافقة وطريقة الدخول، ثم أكمل بيانات المسافر والمستندات.</p>
    </div>
    <section class="section" id="egyptVariants" hidden></section>
    <div id="egyptIntakeMount"></div>
    <div id="egyptFaq"></div>
  `;

  const variantsEl = bodyEl.querySelector("#egyptVariants");
  const mount = bodyEl.querySelector("#egyptIntakeMount");
  loadFaq(bodyEl.querySelector("#egyptFaq"));

  let options;
  try {
    // Fresh: the variants and their prices are what the agency publishes now.
    options = egyptVariantOptions(await loadCatalog({ fresh: true }));
  } catch {
    options = egyptVariantOptions(null);
  }
  const bookable = options.filter((option) => option.bookable);

  const choose = async (option) => {
    variantsEl.querySelectorAll("[data-code]").forEach((button) => {
      const selected = button.dataset.code === option.code;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    await renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item: option.item });
  };

  variantsEl.hidden = false;
  variantsEl.innerHTML = `
    <h3 id="egyptVariantsTitle">نوع الموافقة وطريقة الدخول</h3>
    <div class="variant-list" role="radiogroup" aria-labelledby="egyptVariantsTitle">
      ${options
        .map(
          (option) => `
            <button type="button" class="variant-card${option.bookable ? "" : " variant-unavailable"}" role="radio" aria-checked="false" data-code="${esc(option.code)}" ${option.bookable ? "" : 'disabled aria-disabled="true"'}>
              <strong>${esc(option.name)}</strong>
              <span class="variant-price${option.bookable ? "" : " variant-price-quote"}"><bdi>${esc(option.priceText)}</bdi></span>
            </button>`
        )
        .join("")}
    </div>`;
  variantsEl.querySelectorAll("[data-code]:not([disabled])").forEach((button) => {
    button.addEventListener("click", () => choose(options.find((option) => option.code === button.dataset.code)));
  });

  if (!bookable.length) {
    mount.innerHTML = `<p class="info-note" id="egyptUnavailable">${esc(EGYPT_UNAVAILABLE)}. يرجى التواصل مع الوكالة.</p>`;
    return;
  }
  const preselected = bookable.find((option) => option.item.id === item?.id);
  if (preselected) await choose(preselected);
  else mount.innerHTML = `<p class="field-hint" id="egyptChooseHint">اختر نوع الموافقة أولًا لعرض المتطلبات والسعر.</p>`;
}

async function loadFaq(el) {
  try {
    const settings = await loadPublicSettings();
    const faq = parseFaq(settings.EGYPT_CLEARANCE_FAQ);
    if (!faq.length) return;
    // Help, not the main flow: collapsed, below the request form.
    el.innerHTML = `
      <details class="section faq-section faq-collapsed" id="egyptFaqHelp">
        <summary><h3>مساعدة: الأسئلة الشائعة</h3></summary>
        ${faq.map((entry) => `<details class="faq-item"><summary>${esc(entry.question)}</summary><p>${esc(entry.answer)}</p></details>`).join("")}
      </details>`;
  } catch {
    // FAQ is supplementary content — never block the intake form on it.
  }
}
