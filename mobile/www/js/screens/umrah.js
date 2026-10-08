import { esc, money, toast, skeletonList } from "../ui.js";
import { icon } from "../icons.js";
import { loadPackages } from "../catalog.js";
import { renderIntakeScreen } from "./intake.js";

export async function renderUmrahScreen({ bodyEl, params }) {
  const { item } = params;
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("umrah", { size: 36 })}</div>
      <h2>العمرة</h2>
      <p>ابدأ طلبك وحدد عدد المعتمرين. لكل معتمر بيانات وجواز مستقل، ويراجع فريق نسائم الحرمين السعر والتوفر قبل الدفع.</p>
      <div class="feature-list">
        <span>${icon("check-circle", { size: 16 })} تأشيرة عمرة</span>
        <span>${icon("check-circle", { size: 16 })} باقات بحر وجو</span>
        <span>${icon("check-circle", { size: 16 })} فنادق ونقل وإشراف</span>
        <span>${icon("check-circle", { size: 16 })} متابعة الطلب والمستندات</span>
      </div>
    </div>

    <section class="section">
      <div class="section-head"><h3>باقات العمرة</h3></div>
      <div id="packagesList" class="package-list">${skeletonList(3)}</div>
    </section>

    <button class="primary" id="startUmrahBtn">ابدأ طلب العمرة (تأشيرة فقط)</button>
    <div id="umrahIntakeMount"></div>
  `;

  bodyEl.querySelector("#startUmrahBtn").addEventListener("click", () => mountIntake(bodyEl, item));

  const packagesList = bodyEl.querySelector("#packagesList");
  try {
    const packages = await loadPackages();
    if (!packages.length) {
      packagesList.innerHTML = `<p class="field-hint">لا توجد باقات منشورة حالياً — يمكنك إرسال طلب تأشيرة عمرة مباشرة.</p>`;
    } else {
      packagesList.innerHTML = packages.map((pkg) => `
        <button class="package-card" data-id="${esc(pkg.id)}">
          <div>
            <b>${esc(pkg.name)}</b>
            ${pkg.description ? `<span>${esc(pkg.description)}</span>` : ""}
          </div>
          ${pkg.basePrice ? `<strong>${money(pkg.basePrice, pkg.currency)}</strong>` : `<span class="pending-price">السعر بعد مراجعة الوكالة</span>`}
        </button>`).join("");
      packagesList.querySelectorAll(".package-card").forEach((card) => {
        card.addEventListener("click", () => {
          const pkg = packages.find((p) => p.id === card.dataset.id);
          if (pkg) mountIntake(bodyEl, pkg);
        });
      });
    }
  } catch (error) {
    packagesList.innerHTML = `<p class="field-hint">تعذر تحميل الباقات: ${esc(error.message)}</p>`;
    toast(error.message, { tone: "error" });
  }
}

function mountIntake(bodyEl, item) {
  const mount = bodyEl.querySelector("#umrahIntakeMount");
  mount.scrollIntoView({ behavior: "smooth" });
  renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item });
}
