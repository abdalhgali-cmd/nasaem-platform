// «رحلتي إلى الحرمين» — the Umrah request screen. Renders the server's
// journey object (progress.umrah, built by backend umrah-journey.js) as is:
// no stage, status or action is inferred on the device, so the app, the
// website and the staff dashboard always agree.

const VISA_STATE = { ISSUED: "صدرت التأشيرة", IN_PROGRESS: "قيد الإجراءات", PENDING: "لم تبدأ بعد" };
const SERVICE_STATE = { DELIVERED: "سُلّمت الخدمات", PREPARING: "قيد التجهيز", PENDING: "لم تبدأ بعد" };
const ACTOR = { CUSTOMER: "مطلوب منك", AGENCY: "الوكالة", NONE: "—" };
const STAGE_STATE = { done: "مكتملة", current: "الآن", upcoming: "لاحقًا", not_included: "غير مشمولة" };

// Each server action key opens the screen's real control for it. A button
// is only rendered when that control exists (see bindUmrahJourney).
export const UMRAH_ACTION_TARGETS = {
  COMPLETE_DOCUMENTS: { target: "#documentsBlock", mode: "show" },
  REVIEW_DATA: { target: "#documentsBlock", mode: "show" },
  PAY: { target: "#uploadReceiptBtn", mode: "open" },
  REUPLOAD_RECEIPT: { target: "#uploadReceiptBtn", mode: "open" },
  DOWNLOAD_VISAS: { target: "#umrahPilgrims", mode: "show" },
  VIEW_FILES: { target: "#umrahPilgrims", mode: "show" },
};

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ar", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

function fileButtons(files, esc, icon) {
  return files.map((file) => `<button type="button" class="secondary deliverable-btn umrah-file-btn" data-id="${esc(file.id)}">${icon("download", { size: 16 })} ${esc(file.label || "تحميل")}</button>`).join("");
}

export function umrahJourneyHtml(journey, esc, icon, { detailsHtml = "" } = {}) {
  if (!journey) return "";
  const action = journey.primaryAction && UMRAH_ACTION_TARGETS[journey.primaryAction.key] ? journey.primaryAction : null;
  const now = journey.now || {};
  const files = journey.pilgrims.some((p) => p.visaFiles?.length || p.serviceFiles?.length);
  return `
    <section class="detail-block umrah-journey" id="umrahJourney" aria-labelledby="umrahJourneyTitle">
      <header class="umrah-head">
        <span class="umrah-icon" aria-hidden="true">${icon("umrah", { size: 22 })}</span>
        <div>
          <h3 id="umrahJourneyTitle">${esc(journey.title)}</h3>
          <p class="umrah-status" role="status">${esc(journey.status)}</p>
        </div>
      </header>

      <dl class="umrah-facts">
        <div><dt>رقم الطلب</dt><dd><bdi class="umrah-ref" id="umrahReference">${esc(journey.reference)}</bdi></dd></div>
        <div><dt>الباقة</dt><dd>${esc(journey.packageLabel)}</dd></div>
        <div><dt>عدد المعتمرين</dt><dd>${esc(String(journey.pilgrimCount))}</dd></div>
        ${journey.updatedAt ? `<div><dt>آخر تحديث</dt><dd>${esc(formatDate(journey.updatedAt))}</dd></div>` : ""}
      </dl>

      <ol class="umrah-stages" aria-label="مراحل رحلتك">
        ${journey.stages.map((stage) => `
          <li class="umrah-stage umrah-stage-${esc(stage.state)}"${stage.state === "current" ? ' aria-current="step"' : ""}>
            <span class="umrah-dot" aria-hidden="true">${stage.state === "done" ? icon("check", { size: 14 }) : ""}</span>
            <span class="umrah-stage-text"><b>${esc(stage.label)}</b>${stage.state === "current" && stage.status ? `<small>${esc(stage.status)}</small>` : stage.state === "not_included" ? `<small>غير مشمولة في باقتك</small>` : ""}<span class="sr-only"> — ${esc(STAGE_STATE[stage.state] || "")}</span></span>
          </li>`).join("")}
      </ol>

      <div class="umrah-now${now.actionRequired ? " needs-action" : ""}" id="umrahNow">
        <h4>ماذا يحدث الآن؟</h4>
        ${now.stepLabel ? `<p class="umrah-now-step"><small>المرحلة الحالية</small><b>${esc(now.stepLabel)}</b></p>` : ""}
        <p class="umrah-now-message">${esc(now.actionRequired ? now.message : (now.noActionMessage || now.message || ""))}</p>
        <dl class="umrah-now-meta">
          <div><dt>المسؤول</dt><dd>${esc(ACTOR[now.actor] || "—")}</dd></div>
          <div><dt>هل يلزمك إجراء؟</dt><dd>${now.actionRequired ? "نعم" : "لا"}</dd></div>
          ${now.nextStepLabel ? `<div><dt>الخطوة التالية</dt><dd>${esc(now.nextStepLabel)}</dd></div>` : ""}
        </dl>
        ${action ? `<button type="button" class="primary umrah-action" id="umrahActionBtn" data-umrah-action="${esc(action.key)}" data-progress-target="${esc(UMRAH_ACTION_TARGETS[action.key].target)}" data-progress-mode="${esc(UMRAH_ACTION_TARGETS[action.key].mode)}">${esc(action.label)}</button>` : ""}
      </div>

      <div class="umrah-pilgrims" id="umrahPilgrims" tabindex="-1">
        <h4>المعتمرون${journey.servicesIncluded ? " والخدمات" : ""}</h4>
        <p class="umrah-count">صدرت ${esc(String(journey.visasIssued))} من ${esc(String(journey.pilgrims.length))} تأشيرات${journey.servicesIncluded ? ` — سُلّمت خدمات ${esc(String(journey.servicesDelivered ?? 0))} من ${esc(String(journey.pilgrims.length))}` : ""}</p>
        <ul>
          ${journey.pilgrims.map((pilgrim) => `
            <li class="umrah-pilgrim">
              <div class="umrah-pilgrim-head">
                <b>${esc(pilgrim.name)}</b>
                <span class="umrah-badge umrah-badge-${esc(pilgrim.visa.toLowerCase())}">${icon("visa", { size: 14 })} ${esc(VISA_STATE[pilgrim.visa] || pilgrim.visa)}</span>
                ${pilgrim.services ? `<span class="umrah-badge umrah-badge-${esc(pilgrim.services.toLowerCase())}">${icon("package", { size: 14 })} ${esc(SERVICE_STATE[pilgrim.services] || pilgrim.services)}</span>` : ""}
              </div>
              ${pilgrim.visaFiles?.length || pilgrim.serviceFiles?.length ? `<div class="umrah-files">${fileButtons(pilgrim.visaFiles || [], esc, icon)}${fileButtons(pilgrim.serviceFiles || [], esc, icon)}</div>` : ""}
            </li>`).join("")}
        </ul>
        ${files ? "" : `<p class="umrah-files-empty">تظهر هنا التأشيرات ومستندات الخدمات فور نشرها.</p>`}
      </div>
      ${detailsHtml ? `<details class="journey-details"><summary>تفاصيل كل المراحل</summary>${detailsHtml}</details>` : ""}
    </section>`;
}

// Drops the action button when its control is not on the screen (e.g. the
// payment button is hidden for this state): never a button that cannot act.
export function bindUmrahJourney(root, runAction) {
  const button = root.querySelector("#umrahActionBtn");
  if (!button) return;
  if (!root.querySelector(button.dataset.progressTarget)) {
    button.remove();
    return;
  }
  button.addEventListener("click", (event) => runAction(root, event.currentTarget));
}
