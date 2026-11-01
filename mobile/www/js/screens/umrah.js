import { esc, toast, skeletonList, confirmDialog } from "../ui.js";
import { startingPrice, sdgText, sdgUnavailable, SDG_UNAVAILABLE_NOTICE, shortDescription, durationOf } from "../service-view.js";
import { isUmrahPackage, umrahLoadState, umrahPackageSummary, umrahPriceText, UMRAH_PRICE_MISSING } from "../umrah-view.js";
import { icon } from "../icons.js";
import { loadCatalog, loadPackages } from "../catalog.js";
import { loadAgency, whatsappLink } from "../agency.js";
import { renderIntakeScreen } from "./intake.js";

// Umrah in two moves on one screen: choose the package (each with its exact
// fixed price, the server's SDG equivalent and what it includes), then the
// requirements form right below it. A package without a fixed price cannot be
// booked: it is shown as unavailable, never as «price later».
// `params.packageId`: a package already chosen on the home screen.
// The Umrah service (or its visa type) whose checklist a package without its
// own falls back to — never another package.
async function umrahBaseItem(item) {
  if (item && !isUmrahPackage(item)) return item;
  const catalog = await loadCatalog();
  const items = [...(catalog.services || []), ...(catalog.visaTypes || [])];
  return items.find((candidate) => candidate.code === "SVC-UMRAH") || items.find((candidate) => candidate.code === "VISA-UMRAH") || null;
}

export async function renderUmrahScreen({ bodyEl, params }) {
  const { packageId = null } = params;
  bodyEl.innerHTML = `
    <section class="section umrah-choose">
      <h2 class="umrah-title" id="umrahChooseTitle">اختر باقة العمرة</h2>
      <div class="info-trust info-trust-inline" aria-label="ما نلتزم به قبل بدء الطلب">
        <span>${icon("wallet", { size: 17 })}<b>السعر الظاهر للباقة هو الإجمالي الذي تؤكده قبل الإرسال</b></span>
        <span>${icon("requests", { size: 17 })}<b>تحصل على رقم مرجعي وتتابع الطلب دون حساب</b></span>
        <span>${icon("shield-check", { size: 17 })}<b>لا نعلن اكتمال الخدمة قبل تسليم النتيجة المؤكدة</b></span>
      </div>
      <div id="packagesList" class="package-list" role="radiogroup" aria-labelledby="umrahChooseTitle">${skeletonList(3)}</div>
    </section>

    <div id="umrahIntakeMount"></div>
  `;

  const packagesList = bodyEl.querySelector("#packagesList");
  let packages = [];
  let item;
  let loadError = null;
  try {
    [packages, item] = await Promise.all([loadPackages().then((list) => list.filter(isUmrahPackage)), umrahBaseItem(params.item)]);
  } catch (error) {
    loadError = error;
  }

  // A network or server failure is said as such, with a retry; only an
  // answer from the server can say that nothing is bookable.
  const state = umrahLoadState({ error: loadError, packages });
  if (state.kind === "NETWORK" || state.kind === "API_ERROR") {
    packagesList.innerHTML = `
      <p class="info-note error-note" id="umrahLoadError" data-state="${state.kind}" role="alert">${icon("info", { size: 15 })} ${esc(state.message)}</p>
      <button type="button" class="primary" id="umrahRetryBtn">إعادة المحاولة</button>`;
    packagesList.querySelector("#umrahRetryBtn").addEventListener("click", () => renderUmrahScreen({ bodyEl, params }));
    return;
  }

  const bookable = packages.filter((pkg) => umrahPriceText(pkg));
  if (!bookable.length) {
    // No package published, or published ones without a fixed price yet:
    // the published ones are still listed (not selectable) with the reason.
    packagesList.innerHTML = `
      <p class="info-note" id="umrahUnavailable" data-state="${state.kind}">${icon("info", { size: 15 })} ${esc(state.message)}</p>
      ${packages.map((pkg) => packageCard(pkg)).join("")}
      <a class="secondary" id="umrahWhatsapp" target="_blank" rel="noopener">تواصل معنا عبر واتساب</a>`;
    loadAgency().then((agency) => {
      const link = packagesList.querySelector("#umrahWhatsapp");
      if (link) link.href = whatsappLink(agency.whatsapp, "السلام عليكم، أريد الاستفسار عن باقات العمرة");
    });
    return;
  }

  packagesList.innerHTML = packages.map((pkg) => packageCard(pkg)).join("");

  let currentId = null;
  const choose = (pkg) => {
    if (pkg.id === currentId) return;
    // Another package starts a new form: files already picked would be lost.
    if (currentId && bodyEl.querySelector("#umrahIntakeMount .slot-ok") && !confirmDialog("تغيير الباقة يمسح الملفات التي رفعتها. هل تريد المتابعة؟")) return;
    currentId = pkg.id;
    packagesList.querySelectorAll(".package-card").forEach((card) => {
      const selected = card.dataset.id === pkg.id;
      card.classList.toggle("selected", selected);
      card.setAttribute("aria-checked", String(selected));
    });
    mountIntake(bodyEl, pkg, item);
  };
  packagesList.querySelectorAll(".package-card:not([disabled])").forEach((card) => {
    card.addEventListener("click", () => {
      const pkg = bookable.find((candidate) => candidate.id === card.dataset.id);
      if (pkg) choose(pkg);
    });
  });

  // An explicit choice from the home screen is honoured or reported, never
  // swapped for another package; only without one is a sole package picked.
  if (packageId) {
    const requested = bookable.find((pkg) => pkg.id === packageId);
    if (requested) choose(requested);
    else packagesList.insertAdjacentHTML("beforebegin", `<p class="info-note" id="umrahPreselectGone">${icon("info", { size: 15 })} الباقة التي اخترتها لم تعد متاحة بسعر ثابت. اختر من الباقات التالية.</p>`);
  } else if (bookable.length === 1) {
    choose(bookable[0]);
  }
}

function packageCard(pkg) {
  const details = umrahPackageSummary(pkg);
  const fixed = umrahPriceText(pkg);
  const price = startingPrice(pkg);
  const sdg = fixed && price ? sdgText(price) || (sdgUnavailable(price) ? SDG_UNAVAILABLE_NOTICE : "") : "";
  return `
    <button type="button" class="package-card${fixed ? "" : " package-unavailable"}" role="radio" aria-checked="false" data-id="${esc(pkg.id)}" aria-label="${esc(`${pkg.name}${fixed ? `، ${fixed}` : `، ${UMRAH_PRICE_MISSING}`}`)}" ${fixed ? "" : 'disabled aria-disabled="true"'}>
      <span class="package-radio" aria-hidden="true"></span>
      <div class="package-body">
        <span class="package-title-row"><b>${esc(pkg.name)}</b>${details.kindLabel ? `<span class="package-kind">${esc(details.kindLabel)}</span>` : ""}</span>
        ${shortDescription(pkg) ? `<span class="package-description">${esc(shortDescription(pkg, 82))}</span>` : ""}
        ${durationOf(pkg) ? `<span class="package-duration">${icon("clock", { size: 13 })} ${esc(durationOf(pkg))}</span>` : ""}
        ${details.included.length ? `<span class="package-included"><i>${icon("check", { size: 13 })}</i><span><b>يشمل</b> ${esc(details.included.join("، "))}${details.moreIncluded ? `، و${details.moreIncluded} إضافية` : ""}</span></span>` : ""}
        ${details.excluded.length ? `<span class="package-excluded"><i>${icon("close", { size: 13 })}</i><span><b>لا يشمل</b> ${esc(details.excluded.join("، "))}${details.moreExcluded ? `، و${details.moreExcluded} إضافية` : ""}</span></span>` : ""}
      </div>
      ${fixed
        ? `<strong class="package-price"><bdi>${esc(fixed)}</bdi>${sdg ? `<small><bdi>${esc(sdg)}</bdi></small>` : ""}</strong>`
        : `<span class="pending-price">${esc(UMRAH_PRICE_MISSING)}</span>`}
    </button>`;
}

// `baseItem` (the Umrah service) supplies the checklist when the chosen package
// has none of its own. The package's own fixed price is the total; the form
// shows it beside the send button.
function mountIntake(bodyEl, item, baseItem = null) {
  // A fresh container per choice: an earlier choice still loading finishes
  // into its own detached container and can never replace this form.
  const mount = document.createElement("div");
  bodyEl.querySelector("#umrahIntakeMount").replaceChildren(mount);
  const fixed = umrahPriceText(item);
  const selection = {
    summary: `الباقة المختارة: ${item.name} — ${fixed}`,
    details: { type: "UMRAH_PACKAGE", packageId: item.id, name: item.name, basePrice: startingPrice(item)?.amount ?? null, currency: startingPrice(item)?.currency ?? null },
  };
  renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection, fallbackRequirementsItem: baseItem, showSelection: false, requireChecklist: true })
    .then(() => mount.scrollIntoView({ behavior: "smooth", block: "start" }))
    .catch((error) => toast(error.message, { tone: "error" }));
}
