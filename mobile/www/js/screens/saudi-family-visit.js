import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { loadPublicSettings, parseFaq } from "../catalog.js";
import { renderIntakeScreen } from "./intake.js";

export async function renderSaudiFamilyVisitScreen({ bodyEl, params }) {
  const { item } = params;
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("family", { size: 36 })}</div>
      <h2>تأشيرة الزيارة العائلية</h2>
      <p>نساعدك في استخراج تأشيرة زيارة عائلية للسعودية بالتنسيق مع مرسل الدعوة ومتابعة الإجراءات أولًا بأول.</p>
      <div class="feature-list">
        <span>${icon("document", { size: 16 })} صورة الجواز والصورة الشخصية</span>
        <span>${icon("mail", { size: 16 })} مستند الدعوة (الزيارة)</span>
        <span>${icon("shield-check", { size: 16 })} صورة إقامة مرسل الزيارة من أبشر</span>
      </div>
    </div>
    <div id="familyVisitFaq"></div>
    <div id="familyVisitIntakeMount"></div>
  `;

  loadFaq(bodyEl.querySelector("#familyVisitFaq"));
  await renderIntakeScreen({ bodyEl: bodyEl.querySelector("#familyVisitIntakeMount"), setTitle: () => {}, item });
}

async function loadFaq(el) {
  try {
    const settings = await loadPublicSettings();
    const faq = parseFaq(settings.SAUDI_FAMILY_VISIT_FAQ);
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
