import { loadCatalog, loadPackages } from "../catalog.js";
import { egyptVariantOptions } from "../egypt-view.js";
import { umrahKindOffers, UMRAH_UNAVAILABLE } from "../umrah-view.js";
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
  const choicesMount = bodyEl.querySelector("#smartGuideChoices");
  let selectionGeneration = 0;
  const help = bodyEl.querySelector("#smartGuideHelp");
  let active = true;
  loadAgency().then((agency) => {
    if (active && help) {
      help.href = whatsappLink(agency.whatsapp, "السلام عليكم، أحتاج مساعدة في خدمات الوكالة");
      help.hidden = false;
    }
  }).catch(() => { if (active) status.textContent = "التواصل المباشر غير متاح الآن."; });
  // Render only fresh, published options. The original service screens are the
  // authority for payment, required documents, eligibility and final totals.
  function showOptions(options, onSelect) {
    if (!active) return;
    choicesMount.innerHTML = options.map((option, index) => `
      <button type="button" class="package-card" data-guide-option="${index}" ${option.enabled ? "" : 'disabled aria-disabled="true"'}>
        <span class="service-card-icon">${icon("check-circle", { size: 21 })}</span>
        <span><b>${esc(option.label)}</b><small>${esc(option.description)}</small></span>
        <span class="chevron">${icon("chevron-start", { size: 16 })}</span>
      </button>`).join("") + `<button type="button" class="secondary" id="smartGuideBack">اختيار خدمة أخرى</button>`;
    choicesMount.querySelectorAll("[data-guide-option]").forEach((element) => {
      element.addEventListener("click", () => {
        const option = options[Number(element.dataset.guideOption)];
        if (option?.enabled && active) onSelect(option);
      });
    });
    choicesMount.querySelector("#smartGuideBack")?.addEventListener("click", () => {
      // Back to the original choices without preserving any personal data.
      renderSmartGuideScreen({ bodyEl });
    });
  }

  bodyEl.querySelectorAll("[data-guide]").forEach((button) => button.addEventListener("click", async () => {
    if (!active) return;
    if (button.dataset.guide === "tracking") {
      goToTab("requests", "requests", { title: "متابعة الطلبات" });
      return;
    }
    const generation = ++selectionGeneration;
    status.textContent = "جاري التحقق من الخدمات والأسعار المنشورة...";
    choicesMount.querySelectorAll("[data-guide]").forEach((element) => { element.disabled = true; });
    try {
      const catalog = await loadCatalog({ fresh: true });
      if (!active || generation !== selectionGeneration) return;
      if (catalog.stale) throw new Error("stale catalog");
      if (button.dataset.guide === "egypt") {
        const options = egyptVariantOptions(catalog).map((item) => ({
          label: item.name,
          description: item.bookable ? item.priceText + (item.sdgText ? " — " + item.sdgText : "") : item.priceText,
          enabled: item.bookable,
          item,
        }));
        status.textContent = options.some((option) => option.enabled)
          ? "اختر طريقة الدخول. سيتم تأكيد التفاصيل والمبلغ النهائي قبل إرسال الطلب."
          : "لا توجد طرق دخول متاحة للحجز الآن. يمكن التواصل مع موظف الوكالة.";
        showOptions(options, (option) => openServiceItem(option.item.item, { variantCode: option.item.code }));
        return;
      }
      const outcome = guideOutcome("umrah", catalog);
      if (outcome.action !== "service") {
        status.textContent = "العمرة غير منشورة حالياً. تواصل مع موظف الوكالة للتأكد من التوفر.";
        return;
      }
      const packages = await loadPackages();
      if (!active || generation !== selectionGeneration) return;
      const offers = umrahKindOffers(packages);
      if (!offers.length) {
        status.textContent = "لا توجد باقات عمرة منشورة يمكن عرضها الآن.";
        return;
      }
      const options = offers.map((offer) => ({
        label: offer.label,
        description: offer.packageId ? offer.priceText + (offer.sdgText ? " — " + offer.sdgText : "") : UMRAH_UNAVAILABLE,
        enabled: Boolean(offer.packageId),
        packageId: offer.packageId,
      }));
      status.textContent = options.some((option) => option.enabled)
        ? "هذه الأسعار منشورة من الوكالة. اختر الباقة لمعرفة تفاصيلها ومتطلباتها."
        : "الباقات المنشورة لا تتوفر للحجز حالياً.";
      showOptions(options, (option) => openServiceItem(outcome.service, { packageId: option.packageId }));
    } catch {
      if (active && generation === selectionGeneration) {
        status.textContent = "تعذر التحقق من الخدمات والأسعار الآن. تحقق من الاتصال وأعد المحاولة.";
      }
    } finally {
      if (active && generation === selectionGeneration) {
        choicesMount.querySelectorAll("[data-guide]").forEach((element) => { element.disabled = false; });
      }
    }
  }));
  return { cleanup: () => { active = false; selectionGeneration += 1; } };
}
