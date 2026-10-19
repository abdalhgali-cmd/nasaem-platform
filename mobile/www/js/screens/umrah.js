import { esc, toast, skeletonList } from "../ui.js";
import { startingPrice, priceText, sdgText, sdgUnavailable, SDG_UNAVAILABLE_NOTICE, shortDescription, durationOf } from "../service-view.js";
import { isUmrahPackage, umrahPackageDetails, umrahPriceText } from "../umrah-view.js";
import { icon } from "../icons.js";
import { loadPackages } from "../catalog.js";
import { renderIntakeScreen } from "./intake.js";

export async function renderUmrahScreen({ bodyEl, params }) {
  const { item } = params;
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("umrah", { size: 36 })}</div>
      <h2>العمرة</h2>
      <p>اختر الباقة، ثم بيانات المعتمرين وجوازاتهم وإقامة الضامن ورقم هاتفه، وراجع الإجمالي قبل الدفع.</p>
    </div>

    <section class="section">
      <div class="section-head"><h3>باقات العمرة</h3></div>
      <div id="packagesList" class="package-list">${skeletonList(3)}</div>
    </section>

    <div id="umrahIntakeMount"></div>
  `;

  const packagesList = bodyEl.querySelector("#packagesList");
  try {
    const packages = (await loadPackages()).filter(isUmrahPackage);
    if (!packages.length) {
      packagesList.innerHTML = `
        <p class="field-hint">لا توجد باقات عمرة منشورة حالياً.</p>
        <button class="primary" id="fallbackUmrahBtn">إرسال طلب عمرة عام</button>
      `;
      packagesList.querySelector("#fallbackUmrahBtn").addEventListener("click", () => mountIntake(bodyEl, item));
    } else {
      packagesList.innerHTML = packages.map((pkg) => {
        const details = umrahPackageDetails(pkg);
        const fixed = umrahPriceText(pkg);
        const price = startingPrice(pkg);
        const sdg = price ? sdgText(price) || (fixed && sdgUnavailable(price) ? SDG_UNAVAILABLE_NOTICE : "") : "";
        return `
        <button class="package-card" data-id="${esc(pkg.id)}">
          <div>
            <b>${esc(pkg.name)}</b>
            ${details.kindLabel ? `<span class="package-kind">${esc(details.kindLabel)}</span>` : ""}
            ${shortDescription(pkg) ? `<span>${esc(shortDescription(pkg))}</span>` : ""}${durationOf(pkg) ? `<span>${esc(durationOf(pkg))}</span>` : ""}
            ${details.included.length ? `<span class="package-included">يشمل: ${esc(details.included.join("، "))}</span>` : ""}
            ${details.excluded.length ? `<span class="package-excluded">لا يشمل: ${esc(details.excluded.join("، "))}</span>` : ""}
          </div>
          ${fixed ? `<strong class="package-price"><bdi>${esc(fixed)}</bdi>${sdg ? `<small><bdi>${esc(sdg)}</bdi></small>` : ""}</strong>`
            : price ? `<strong><bdi>${esc(priceText(price))}</bdi>${sdgText(price) ? `<small><bdi>${esc(sdgText(price))}</bdi></small>` : ""}</strong>`
            : `<span class="pending-price">السعر بعد مراجعة الوكالة</span>`}
        </button>`;
      }).join("");
      packagesList.querySelectorAll(".package-card").forEach((card) => {
        card.addEventListener("click", () => {
          const pkg = packages.find((p) => p.id === card.dataset.id);
          if (pkg) mountIntake(bodyEl, pkg, item);
        });
      });
    }
  } catch (error) {
    packagesList.innerHTML = `<p class="field-hint">تعذر تحميل الباقات: ${esc(error.message)}</p>`;
    toast(error.message, { tone: "error" });
  }
}

// `baseItem` (the Umrah service) supplies the checklist when the chosen package
// has none of its own.
function mountIntake(bodyEl, item, baseItem = null) {
  const mount = bodyEl.querySelector("#umrahIntakeMount");
  mount.scrollIntoView({ behavior: "smooth" });
  const price = baseItem ? startingPrice(item) : null;
  const fixed = baseItem ? umrahPriceText(item) : null;
  const selection = baseItem
    ? {
        summary: fixed
          ? `الباقة المختارة: ${item.name} — ${fixed}`
          : `الباقة المختارة: ${item.name}${price ? ` — السعر المعلن من ${priceText(price)}${sdgText(price) ? ` (${sdgText(price)})` : ""}، والسعر النهائي تؤكده الوكالة` : ""}`,
        details: { type: "UMRAH_PACKAGE", packageId: item.id, name: item.name, basePrice: price?.amount ?? null, currency: price?.currency ?? null },
      }
    : null;
  renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection, fallbackRequirementsItem: baseItem }).catch((error) => toast(error.message, { tone: "error" }));
}
