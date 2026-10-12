import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { loadCatalog, loadPublicSettings, parseFaq } from "../catalog.js";
import { egyptVariants, variantPriceText } from "../egypt-view.js";
import { renderIntakeScreen } from "./intake.js";

// Egypt security approval (موافقة حربي). Order of the screen: the variant
// (entry method) with its configured price first, then the request form
// (travelers, documents, the confirmed total), and only then the help (FAQ,
// collapsed). When the agency has not published variants, the original
// single item is used and the entry method is asked in the form.
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

  let variants = [];
  try {
    // Fresh: the variants and their prices are what the agency publishes now.
    variants = egyptVariants(await loadCatalog({ fresh: true }));
  } catch {
    variants = [];
  }
  if (!variants.length) {
    await renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item });
    return;
  }

  const preselected = variants.find((variant) => variant.id === item?.id);
  const choose = async (variant) => {
    variantsEl.querySelectorAll("[data-variant]").forEach((button) => {
      const selected = button.dataset.variant === variant.id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    await renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item: variant });
  };

  variantsEl.hidden = false;
  variantsEl.innerHTML = `
    <h3 id="egyptVariantsTitle">نوع الموافقة وطريقة الدخول</h3>
    <div class="variant-list" role="radiogroup" aria-labelledby="egyptVariantsTitle">
      ${variants
        .map((variant) => {
          const price = variantPriceText(variant);
          return `
            <button type="button" class="variant-card" role="radio" aria-checked="false" data-variant="${esc(variant.id)}" data-code="${esc(variant.code)}">
              <strong>${esc(variant.name)}</strong>
              <span class="variant-price${price.fixed ? "" : " variant-price-quote"}"><bdi>${esc(price.text)}</bdi></span>
            </button>`;
        })
        .join("")}
    </div>`;
  variantsEl.querySelectorAll("[data-variant]").forEach((button) => {
    button.addEventListener("click", () => choose(variants.find((variant) => variant.id === button.dataset.variant)));
  });

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
