import { esc, confirmDialog } from "../ui.js";
import { icon } from "../icons.js";
import { loadCatalog, loadPublicSettings, parseFaq } from "../catalog.js";
import { EGYPT_UNAVAILABLE, egyptStepsHtml, egyptVariantOptions } from "../egypt-view.js";
import { renderIntakeScreen } from "./intake.js";

// Egypt security approval (موافقة حربي). Order of the screen: the variant
// (entry method) with its configured price first, then the request form
// (travelers, documents, the confirmed total), and only then the help (FAQ,
// collapsed). A variant without a published fixed price is shown as
// unavailable; new bookings never fall back to the original item or a quote.
export async function renderEgyptClearanceScreen({ bodyEl, params }) {
  // `variantCode`: an entry method already chosen on the home screen.
  const { item, variantCode = null } = params;
  bodyEl.innerHTML = `
    <div class="service-hero service-hero-egypt service-hero-compact">
      <div class="service-hero-icon">${icon("shield-check", { size: 30 })}</div>
      <h2>الموافقة الأمنية لمصر</h2>
      <p>سعر ثابت، ولا يلزم شراء تذكرة من نسائم.</p>
    </div>
    <section class="info-trust" aria-label="ما نلتزم به قبل بدء الطلب">
      <span>${icon("wallet", { size: 17 })}<b>كل طريقة دخول تعرض سعرها الحقيقي قبل بدء الطلب</b></span>
      <span>${icon("requests", { size: 17 })}<b>رقم مرجعي ومتابعة لكل طلب دون حساب</b></span>
      <span>${icon("shield-check", { size: 17 })}<b>لا نعلن صدور الموافقة قبل رفعها من فريق الوكالة</b></span>
    </section>
    <div id="egyptStepsMount">${egyptStepsHtml(1, esc)}</div>
    <section class="section" id="egyptVariants" hidden></section>
    <div id="egyptIntakeMount"></div>
    <div id="egyptFaq"></div>
  `;

  const variantsEl = bodyEl.querySelector("#egyptVariants");
  const mount = bodyEl.querySelector("#egyptIntakeMount");
  loadFaq(bodyEl.querySelector("#egyptFaq"));

  let catalog;
  try {
    // Booking must use a freshly confirmed catalog, never cached prices.
    catalog = await loadCatalog({ fresh: true });
    if (catalog.stale) throw new Error("تعذر تحديث الأسعار الحالية من الخادم.");
  } catch {
    variantsEl.hidden = false;
    variantsEl.innerHTML = '<p role="alert" class="info-note">تعذر تحميل أسعار الموافقة من الخادم. تحقق من الاتصال وأعد المحاولة؛ لم يتم إيقاف الخدمة.</p><button type="button" class="btn secondary" id="egyptRetryCatalog">إعادة المحاولة</button>';
    variantsEl.querySelector("#egyptRetryCatalog").addEventListener("click", () => renderEgyptClearanceScreen({ bodyEl, params }));
    return;
  }
  // A confirmed catalog without active, FIXED-priced variants is genuinely
  // unavailable; unlike a network error this is an agency configuration issue.
  const options = egyptVariantOptions(catalog);
  const bookable = options.filter((option) => option.bookable);

  let currentCode = null;
  const choose = async (option) => {
    if (option.code === currentCode) return;
    // Another entry method starts a new form: files already picked would be lost.
    if (currentCode && mount.querySelector(".slot-ok") && !confirmDialog("تغيير طريقة الدخول يمسح الملفات التي رفعتها. هل تريد المتابعة؟")) return;
    currentCode = option.code;
    bodyEl.querySelector("#egyptStepsMount").innerHTML = egyptStepsHtml(2, esc);
    variantsEl.querySelectorAll("[data-code]").forEach((button) => {
      const selected = button.dataset.code === option.code;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    // A fresh container per choice: an earlier choice still loading finishes
    // into its own detached container and can never replace this form.
    const form = document.createElement("div");
    mount.replaceChildren(form);
    await renderIntakeScreen({ bodyEl: form, setTitle: () => {}, item: option.item });
  };

  variantsEl.hidden = false;
  variantsEl.innerHTML = `
    <h3 id="egyptVariantsTitle">طريقة الدخول</h3>
    <div class="variant-list" role="radiogroup" aria-labelledby="egyptVariantsTitle">
      ${options
        .map(
          (option) => `
            <button type="button" class="variant-card${option.bookable ? "" : " variant-unavailable"}" role="radio" aria-checked="false" data-code="${esc(option.code)}" ${option.bookable ? "" : 'disabled aria-disabled="true"'}>
              <span class="variant-method-icon" aria-hidden="true">${icon(option.entryMode === "AIR" ? "plane" : "map-pin", { size: 22 })}</span>
              <span class="variant-copy"><strong>${esc(option.name)}</strong>
                <span class="variant-price${option.bookable ? "" : " variant-price-quote"}"><bdi>${esc(option.priceText)}</bdi></span>
                ${option.sdgText ? `<small class="variant-sdg"><bdi>${esc(option.sdgText)}</bdi></small>` : ""}
              </span>
              ${option.bookable ? `<span class="variant-choose">اختر ${icon("chevron-start", { size: 14 })}</span>` : ""}
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
  // An explicit choice from the home screen is honoured or reported, never
  // swapped for the other entry method.
  if (variantCode && !bookable.some((option) => option.code === variantCode)) {
    mount.innerHTML = `<p class="info-note" id="egyptPreselectGone">طريقة الدخول التي اخترتها غير متاحة الآن بسعر ثابت. اختر من الخيارات أعلاه.</p>`;
    return;
  }
  const preselected = bookable.find((option) => option.code === variantCode) || bookable.find((option) => option.item.id === item?.id) || (!variantCode && bookable.length === 1 ? bookable[0] : null);
  if (preselected) await choose(preselected);
  else mount.innerHTML = `<p class="field-hint" id="egyptChooseHint">اختر طريقة الدخول لعرض المتطلبات.</p>`;
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
