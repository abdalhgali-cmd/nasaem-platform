import { esc, toast, skeletonList, confirmDialog } from "../ui.js";
import { startingPrice, sdgText, sdgUnavailable, SDG_UNAVAILABLE_NOTICE, shortDescription, durationOf } from "../service-view.js";
import { isUmrahPackage, umrahPackageDetails, umrahPriceText, UMRAH_UNAVAILABLE } from "../umrah-view.js";
import { icon } from "../icons.js";
import { loadPackages } from "../catalog.js";
import { loadAgency, whatsappLink } from "../agency.js";
import { renderIntakeScreen } from "./intake.js";

// Umrah in two moves on one screen: choose the package (each with its exact
// fixed price, the server's SDG equivalent and what it includes), then the
// requirements form right below it. A package without a fixed price cannot be
// booked: it is shown as unavailable, never as «price later».
// `params.packageId`: a package already chosen on the home screen.
export async function renderUmrahScreen({ bodyEl, params }) {
  const { item, packageId = null } = params;
  bodyEl.innerHTML = `
    <section class="section umrah-choose">
      <h2 class="umrah-title" id="umrahChooseTitle">اختر باقة العمرة</h2>
      <p class="field-hint">سعر ثابت ومعلن: لا عرض سعر ولا موافقة لاحقة.</p>
      <div id="packagesList" class="package-list" role="radiogroup" aria-labelledby="umrahChooseTitle">${skeletonList(3)}</div>
    </section>

    <div id="umrahIntakeMount"></div>
  `;

  const packagesList = bodyEl.querySelector("#packagesList");
  let packages;
  try {
    packages = (await loadPackages()).filter(isUmrahPackage);
  } catch (error) {
    packagesList.innerHTML = `<p class="field-hint">تعذر تحميل الباقات: ${esc(error.message)}</p>`;
    toast(error.message, { tone: "error" });
    return;
  }

  const bookable = packages.filter((pkg) => umrahPriceText(pkg));
  if (!bookable.length) {
    packagesList.innerHTML = `
      <p class="info-note" id="umrahUnavailable">${icon("info", { size: 15 })} ${esc(UMRAH_UNAVAILABLE)}</p>
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
  const details = umrahPackageDetails(pkg);
  const fixed = umrahPriceText(pkg);
  const price = startingPrice(pkg);
  const sdg = fixed && price ? sdgText(price) || (sdgUnavailable(price) ? SDG_UNAVAILABLE_NOTICE : "") : "";
  return `
    <button type="button" class="package-card${fixed ? "" : " package-unavailable"}" role="radio" aria-checked="false" data-id="${esc(pkg.id)}" ${fixed ? "" : 'disabled aria-disabled="true"'}>
      <span class="package-radio" aria-hidden="true"></span>
      <div class="package-body">
        <b>${esc(pkg.name)}</b>
        ${details.kindLabel ? `<span class="package-kind">${esc(details.kindLabel)}</span>` : ""}
        ${shortDescription(pkg) ? `<span>${esc(shortDescription(pkg))}</span>` : ""}${durationOf(pkg) ? `<span>${esc(durationOf(pkg))}</span>` : ""}
        ${details.included.length ? `<span class="package-included">يشمل: ${esc(details.included.join("، "))}</span>` : ""}
        ${details.excluded.length ? `<span class="package-excluded">لا يشمل: ${esc(details.excluded.join("، "))}</span>` : ""}
      </div>
      ${fixed
        ? `<strong class="package-price"><bdi>${esc(fixed)}</bdi>${sdg ? `<small><bdi>${esc(sdg)}</bdi></small>` : ""}</strong>`
        : `<span class="pending-price">${esc(UMRAH_UNAVAILABLE)}</span>`}
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
  renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection, fallbackRequirementsItem: baseItem, showSelection: false })
    .then(() => mount.scrollIntoView({ behavior: "smooth", block: "start" }))
    .catch((error) => toast(error.message, { tone: "error" }));
}
