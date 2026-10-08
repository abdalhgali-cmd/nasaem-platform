import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { loadPublicSettings, parseFaq } from "../catalog.js";
import { renderIntakeScreen } from "./intake.js";

export async function renderEgyptClearanceScreen({ bodyEl, params }) {
  const { item } = params;
  bodyEl.innerHTML = `
    <div class="service-hero service-hero-egypt">
      <div class="service-hero-icon">${icon("shield-check", { size: 36 })}</div>
      <h2>الموافقة الأمنية لمصر</h2>
      <p>نتابع إجراءات الموافقة الأمنية للدخول إلى مصر نيابة عنك، من تقديم الطلب حتى صدور الموافقة.</p>
      <div class="feature-list">
        <span>${icon("document", { size: 16 })} صورة الجواز وتذكرة الطيران أو طلب الحجز</span>
        <span>${icon("clock", { size: 16 })} مدة معالجة تحتاج وقتًا كافيًا قبل تاريخ الدخول</span>
        <span>${icon("map-pin", { size: 16 })} بعد صدور الموافقة، أكمل بيانات السفر من صفحة الطلب</span>
      </div>
    </div>
    <div id="egyptFaq"></div>
    <div id="egyptIntakeMount"></div>
  `;

  loadFaq(bodyEl.querySelector("#egyptFaq"));
  await renderIntakeScreen({ bodyEl: bodyEl.querySelector("#egyptIntakeMount"), setTitle: () => {}, item });
}

async function loadFaq(el) {
  try {
    const settings = await loadPublicSettings();
    const faq = parseFaq(settings.EGYPT_CLEARANCE_FAQ);
    if (!faq.length) return;
    el.innerHTML = `
      <section class="section faq-section">
        <h3>الأسئلة الشائعة</h3>
        ${faq.map((entry) => `<details class="faq-item"><summary>${esc(entry.question)}</summary><p>${esc(entry.answer)}</p></details>`).join("")}
      </section>`;
  } catch {
    // FAQ is supplementary content — never block the intake form on it.
  }
}
