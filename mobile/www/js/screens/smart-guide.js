import { loadCatalog } from "../catalog.js";
import { loadAgency, whatsappLink } from "../agency.js";
import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { goToTab } from "../router.js";
import { openServiceItem } from "./services.js";
import { GUIDE_CHOICES, guideOutcome } from "../smart-guide-core.js";

// Deliberately not a generative chatbot: routes to published services only.
// No passport, credentials, payment or conversation text is transmitted.
export async function renderSmartGuideScreen({ bodyEl }) {
  bodyEl.innerHTML = `
    <section class="section" aria-label="مساعد خدمات نسائم الحرمين">
      <div class="about-card">
        <h2>كيف نقدر نساعدك؟</h2>
        <p>دليل تفاعلي يساعدك تختار الخدمة الصحيحة من خدمات الوكالة المنشورة. الأسعار والمتطلبات تظهر في صفحة الخدمة، ولا يتم إنشاء أي طلب دون تأكيدك.</p>
      </div>
      <div class="package-list" id="smartGuideChoices">
        ${GUIDE_CHOICES.map((choice) => `
          <button type="button" class="package-card" data-guide="${esc(choice.key)}">
            <span class="service-card-icon">${icon(choice.key === "umrah" ? "umrah" : choice.key === "egypt" ? "shield-check" : "requests", { size: 22 })}</span>
            <span><b>${esc(choice.label)}</b><small>${esc(choice.help)}</small></span>
            <span class="chevron">${icon("chevron-start", { size: 16 })}</span>
          </button>`).join("")}
      </div>
      <p class="field-hint" id="smartGuideMessage" role="status" aria-live="polite"></p>
      <a class="help-strip" id="smartGuideHelp" href="#" hidden><span class="help-strip-icon">${icon("chat", { size: 20 })}</span><span class="help-strip-body"><b>تواصل مع موظف الوكالة</b><small>استفسر عن خدمة غير منشورة</small></span></a>
    </section>`;
  const status = bodyEl.querySelector("#smartGuideMessage");
  const help = bodyEl.querySelector("#smartGuideHelp");
  let active = true;
  loadAgency().then((agency) => {
    if (active && help) {
      help.href = whatsappLink(agency.whatsapp, "السلام عليكم، أحتاج مساعدة في خدمات الوكالة");
      help.hidden = false;
    }
  }).catch(() => { if (active) status.textContent = "التواصل المباشر غير متاح الآن."; });
  bodyEl.querySelectorAll("[data-guide]").forEach((button) => button.addEventListener("click", async () => {
    if (!active) return;
    if (button.dataset.guide === "tracking") {
      goToTab("requests", "requests", { title: "متابعة الطلبات" });
      return;
    }
    status.textContent = "جاري التحقق من الخدمات المنشورة...";
    button.disabled = true;
    try {
      const catalog = await loadCatalog({ fresh: true });
      if (!active) return;
      const outcome = guideOutcome(button.dataset.guide, catalog);
      if (outcome.action === "service") {
        status.textContent = "";
        openServiceItem(outcome.service);
      } else {
        status.textContent = "الخدمة غير منشورة حالياً. تواصل مع موظف الوكالة للتأكد من التوفر.";
      }
    } catch {
      if (active) status.textContent = "تعذر التحقق من الخدمات الآن. حاول مرة أخرى عند توفر الاتصال.";
    } finally {
      button.disabled = false;
    }
  }));
  return { cleanup: () => { active = false; } };
}
