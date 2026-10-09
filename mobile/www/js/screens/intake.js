import { api, ApiError } from "../api.js";
import { esc, toast, fieldError, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import { goToTab } from "../router.js";
import { getCustomer, isAccountUnlocked } from "../auth.js";
import { newSubmissionKey, submitRequestForm, submitFailureMessage, showSubmitted } from "../submission.js";
import { confirmationNotice, countSelectedDocuments, parseRequirementsResponse } from "../experience-core.js";
import { setTrackingPrefill } from "../tracking.js";

// Hard backend limits (upload.middleware.js: .array("documents", 6);
// contact-requests.validators.js caps documentLabels/documentRequirementIds/
// documentTravelerIndexes at 6 entries too) — the form must never let a
// customer build a submission the server is guaranteed to reject.
const MAX_DOCUMENTS = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOC_ACCEPT = "image/*,.pdf";

function inputFor(requirement) {
  const name = `req_${requirement.id}`;
  const label = esc(requirement.name) + (requirement.required ? " *" : "");

  if (requirement.type === "DOCUMENT") {
    return `
      <label class="field" data-req="${esc(requirement.id)}" data-doc-field>
        <span>${label}</span>
        <input type="file" name="${name}" accept="${ALLOWED_DOC_ACCEPT}" ${requirement.required ? "required" : ""}>
        <span class="field-hint">صورة واضحة أو PDF، بحد أقصى 10MB</span>
      </label>`;
  }
  if (requirement.type === "SELECT") {
    const options = Array.isArray(requirement.options) ? requirement.options : Object.keys(requirement.options || {});
    return `
      <label class="field" data-req="${esc(requirement.id)}">
        <span>${label}</span>
        <select name="${name}" ${requirement.required ? "required" : ""}>
          <option value="">اختر</option>
          ${options.map((option) => `<option value="${esc(option)}">${esc(option)}</option>`).join("")}
        </select>
      </label>`;
  }
  if (requirement.type === "YES_NO") {
    return `
      <label class="field" data-req="${esc(requirement.id)}">
        <span>${label}</span>
        <select name="${name}" ${requirement.required ? "required" : ""}>
          <option value="">اختر</option>
          <option value="true">نعم</option>
          <option value="false">لا</option>
        </select>
      </label>`;
  }
  const type = requirement.type === "NUMBER" ? "number" : requirement.type === "DATE" ? "date" : "text";
  return `
    <label class="field" data-req="${esc(requirement.id)}">
      <span>${label}</span>
      <input name="${name}" type="${type}" ${requirement.required ? "required" : ""}>
    </label>`;
}

function requirementApplies(requirement, answers) {
  if (!requirement.conditionRequirementId || !requirement.conditionOperator) return true;
  const actual = answers[requirement.conditionRequirementId];
  const expected = requirement.conditionValue;
  if (requirement.conditionOperator === "EQUALS") return String(actual ?? "") === String(expected ?? "");
  if (requirement.conditionOperator === "NOT_EQUALS") return String(actual ?? "") !== String(expected ?? "");
  const actualNum = Number(actual);
  const expectedNum = Number(expected);
  if (!Number.isFinite(actualNum) || !Number.isFinite(expectedNum)) return false;
  if (requirement.conditionOperator === "GREATER_THAN") return actualNum > expectedNum;
  if (requirement.conditionOperator === "LESS_THAN") return actualNum < expectedNum;
  return true;
}

function travelerFieldset(index) {
  return `
    <fieldset class="traveler-card">
      <legend>المسافر ${index + 1}</legend>
      <label class="field">
        <span>الاسم كما في جواز السفر *</span>
        <input name="t_name_${index}" required>
      </label>
      <div class="field-row">
        <label class="field">
          <span>رقم الجواز</span>
          <input name="t_pass_${index}">
        </label>
        <label class="field">
          <span>الجنسية</span>
          <input name="t_nat_${index}">
        </label>
      </div>
      <label class="field" data-doc-field>
        <span>صورة الجواز (اختياري)</span>
        <input name="t_doc_${index}" type="file" accept="${ALLOWED_DOC_ACCEPT}">
        <span class="field-hint">أرفقها إن كانت متوفرة. المستندات المطلوبة فعلًا لهذه الخدمة تظهر في «متطلبات الخدمة»، ويمكن إرسال أي مستند لاحقًا من «طلباتي».</span>
      </label>
    </fieldset>`;
}

// Resolves to the service's checklist ([] only when the server confirmed it
// is empty, or the item has no checklist at all). Throws when it couldn't be
// loaded: the form is then not shown, so nothing is submitted unchecked.
async function fetchRequirements(item) {
  if (!item.id) return [];
  const scope = item.isVisaType ? "visa-types" : "services";
  const requirements = parseRequirementsResponse(await api(`/${scope}/${item.id}/requirements/public`));
  if (!requirements) throw new ApiError("وصلت استجابة غير متوقعة من الخادم.", { status: 0, code: "BAD_RESPONSE" });
  return requirements;
}

function countPlannedDocuments(form, requirements, answers) {
  const travelerFiles = [...form.querySelectorAll('input[type="file"][name^="t_doc_"]')].map((el) => Boolean(el.files?.length));
  const requirementFiles = requirements
    .filter((requirement) => requirement.type === "DOCUMENT")
    .map((requirement) => {
      const el = form.querySelector(`[data-req="${CSS.escape(requirement.id)}"] input[type="file"]`);
      return { applies: requirementApplies(requirement, answers), selected: Boolean(el?.files?.length) };
    });
  return countSelectedDocuments({ travelerFiles, requirementFiles });
}

function validateFile(file) {
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) return "حجم الملف يتجاوز 10MB";
  return null;
}

// The one generic, requirement-driven submission screen behind every
// service's "ابدأ الطلب" button — the fields themselves are never generic
// (they come straight from that service/visa type's own requirement
// checklist, configured in the admin dashboard), so this stays honest with
// "لا تستخدم نموذجاً عاماً إذا كانت الخدمة تحتاج حقولاً خاصة".
// `selection` (optional): what the customer already picked before the form,
// e.g. a specific flight — { summary: "PZU ← JED …", details: {...} }. It is
// shown on the form and sent with the request so the agency sees it.
export async function renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers = true, selection = null }) {
  setTitle(`طلب ${item.name}`);
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 28 })}<p>جارٍ تحميل متطلبات الخدمة…</p></div>`;

  let requirements;
  try {
    requirements = await fetchRequirements(item);
  } catch (error) {
    // Without the checklist we can't tell the customer what to send, so the
    // form is not offered at all — only a retry.
    bodyEl.innerHTML = `
      <div class="empty-state" id="requirementsError" role="alert">
        ${icon("alert", { size: 28 })}
        <h3>تعذّر تحميل متطلبات الخدمة</h3>
        <p>${esc(error?.status === 0 ? "تحقق من اتصالك بالإنترنت ثم أعد المحاولة." : "حدث خطأ في الخادم. أعد المحاولة بعد قليل.")} لن نعرض النموذج قبل التأكد من المستندات المطلوبة لهذه الخدمة.</p>
        <button type="button" class="primary" id="retryRequirementsBtn">إعادة المحاولة</button>
      </div>`;
    bodyEl.querySelector("#retryRequirementsBtn").addEventListener("click", () =>
      renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers, selection })
    );
    return;
  }
  // Prefill from the account only when it is actually unlocked.
  const customer = isAccountUnlocked() ? getCustomer() : null;
  // One key for this form, reused on every retry (no duplicate requests).
  const submissionKey = newSubmissionKey();

  bodyEl.innerHTML = `
    <form id="intakeForm" class="form" novalidate>
      ${selection ? `<section class="form-section selection-card"><h3>${icon("check-circle", { size: 18 })} اختيارك</h3><p>${esc(selection.summary)}</p></section>` : ""}
      <section class="form-section">
        <h3>بيانات التواصل</h3>
        <p class="field-hint">لا تحتاج إلى حساب. سنستخدم رقم هاتفك للتواصل معك ولمتابعة طلبك برمز تحقق عبر واتساب.</p>
        <label class="field">
          <span>الاسم الكامل *</span>
          <input name="name" required value="${esc(customer?.fullName || "")}">
        </label>
        <div class="field-row">
          <label class="field">
            <span>رقم الهاتف *</span>
            <input name="phone" inputmode="tel" required value="${esc(customer?.phone || "")}">
          </label>
          <label class="field">
            <span>البريد الإلكتروني (اختياري)</span>
            <input name="email" type="email" value="${esc(customer?.email || "")}">
          </label>
        </div>
      </section>

      <section class="form-section">
        <h3>المسافرون</h3>
        <label class="field">
          <span>عدد المسافرين *</span>
          <input id="travelerCount" name="travelerCount" type="number" min="1" max="${allowMultipleTravelers ? 6 : 1}" value="1" required ${allowMultipleTravelers ? "" : "readonly"}>
        </label>
        <div id="travelersBox"></div>
        <p id="docBudgetNote" class="field-hint"></p>
      </section>

      ${requirements.length ? `
        <section class="form-section">
          <h3>متطلبات الخدمة</h3>
          <p class="field-hint">هذه الحقول يديرها فريق نسائم الحرمين وتختلف حسب الخدمة.</p>
          <div id="dynamicReqs">${requirements.map(inputFor).join("")}</div>
        </section>` : ""}

      <section class="form-section">
        <label class="field">
          <span>ملاحظات إضافية</span>
          <textarea name="notes" rows="3" placeholder="أي تفاصيل تريد إضافتها">طلب ${esc(item.name)}</textarea>
        </label>
      </section>

      <div id="uploadProgressWrap" class="upload-progress-wrap" hidden>
        <div class="upload-progress-bar"><div id="uploadProgressFill" class="upload-progress-fill"></div></div>
        <span id="uploadProgressLabel">0%</span>
      </div>

      <button type="submit" id="submitIntakeBtn" class="primary">إرسال الطلب للوكالة</button>
    </form>
  `;

  const form = bodyEl.querySelector("#intakeForm");
  const travelerCountInput = bodyEl.querySelector("#travelerCount");
  const travelersBox = bodyEl.querySelector("#travelersBox");
  const docBudgetNote = bodyEl.querySelector("#docBudgetNote");

  function answersFromForm() {
    const raw = new FormData(form);
    const answers = {};
    for (const requirement of requirements) {
      if (requirement.type === "DOCUMENT") continue;
      const value = raw.get(`req_${requirement.id}`);
      if (value === null || value === "") continue;
      answers[requirement.id] = requirement.type === "NUMBER" ? Number(value) : requirement.type === "YES_NO" ? value === "true" : value;
    }
    return answers;
  }

  function refreshConditionalFields() {
    const answers = answersFromForm();
    for (const requirement of requirements) {
      const fieldEl = form.querySelector(`[data-req="${CSS.escape(requirement.id)}"]`);
      if (!fieldEl) continue;
      const shouldShow = requirementApplies(requirement, answers);
      fieldEl.hidden = !shouldShow;
      const control = fieldEl.querySelector("input,select,textarea");
      if (control) control.required = shouldShow && Boolean(requirement.required);
    }
  }

  function redrawTravelers() {
    const count = Math.max(1, Math.min(allowMultipleTravelers ? 6 : 1, Number(travelerCountInput.value) || 1));
    travelerCountInput.value = count;
    travelersBox.innerHTML = Array.from({ length: count }, (_, i) => travelerFieldset(i)).join("");
    updateDocBudgetNote();
  }

  function updateDocBudgetNote() {
    const count = countPlannedDocuments(form, requirements, answersFromForm());
    docBudgetNote.textContent = `المستندات المرفقة: ${count} من أصل ${MAX_DOCUMENTS} كحد أقصى لكل طلب.`;
    docBudgetNote.classList.toggle("field-hint-warn", count > MAX_DOCUMENTS);
  }

  travelerCountInput.addEventListener("change", redrawTravelers);
  form.addEventListener("change", () => {
    refreshConditionalFields();
    updateDocBudgetNote();
  });
  redrawTravelers();
  refreshConditionalFields();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".field-error").forEach((el) => el.remove());

    const travelerCount = Number(travelerCountInput.value) || 1;
    const plannedDocs = countPlannedDocuments(form, requirements, answersFromForm());
    if (plannedDocs > MAX_DOCUMENTS) {
      toast(`يمكن إرفاق ${MAX_DOCUMENTS} ملفات كحد أقصى مع الطلب (اخترت ${plannedDocs}). أزل بعضها وأرسلها لاحقًا من «طلباتي».`, { tone: "error" });
      return;
    }

    const raw = new FormData(form);
    const travelers = [];
    const files = [];
    const labels = [];
    const indexes = [];
    const requirementIds = [];

    for (let i = 0; i < travelerCount; i += 1) {
      const file = raw.get(`t_doc_${i}`);
      const sizeError = validateFile(file);
      if (sizeError) {
        toast(`مستند المسافر ${i + 1}: ${sizeError}`, { tone: "error" });
        return;
      }
      travelers.push({
        fullName: raw.get(`t_name_${i}`),
        passportNo: raw.get(`t_pass_${i}`) || "",
        nationality: raw.get(`t_nat_${i}`) || "",
        isPrimary: i === 0,
      });
      if (file && file.size) {
        files.push(file);
        labels.push(`صورة جواز المسافر ${i + 1}`);
        indexes.push(String(i));
        requirementIds.push("");
      }
    }

    const answers = answersFromForm();
    for (const requirement of requirements) {
      if (requirement.type !== "DOCUMENT" || !requirementApplies(requirement, answers)) continue;
      const file = raw.get(`req_${requirement.id}`);
      const sizeError = validateFile(file);
      if (sizeError) {
        toast(`${requirement.name}: ${sizeError}`, { tone: "error" });
        return;
      }
      if (file && file.size) {
        files.push(file);
        labels.push(requirement.name);
        indexes.push("");
        requirementIds.push(requirement.id);
      }
    }

    const submitBtn = bodyEl.querySelector("#submitIntakeBtn");
    setLoading(submitBtn, true, "جارٍ الإرسال…");

    const payload = new FormData();
    payload.set("name", raw.get("name") || "");
    payload.set("phone", raw.get("phone") || "");
    if (raw.get("email")) payload.set("email", raw.get("email"));
    payload.set("service", item.name);
    if (item.id) payload.set(item.isVisaType ? "visaTypeId" : "serviceId", item.id);
    if (item.serviceId) payload.set("serviceId", item.serviceId);
    const notes = raw.get("notes") || `طلب ${item.name}`;
    payload.set("message", selection ? `${notes}\n${selection.summary}` : notes);
    payload.set("travelerCount", String(travelerCount));
    payload.set("travelers", JSON.stringify(travelers));
    payload.set("answers", JSON.stringify(answers));
    payload.set("intakeData", JSON.stringify({ travelers, answers, notes: raw.get("notes") || "", ...(selection ? { selection: selection.details || { summary: selection.summary } } : {}) }));
    payload.set("documentLabels", JSON.stringify(labels));
    payload.set("documentTravelerIndexes", JSON.stringify(indexes));
    payload.set("documentRequirementIds", JSON.stringify(requirementIds));
    files.forEach((file) => payload.append("documents", file));

    const progressWrap = bodyEl.querySelector("#uploadProgressWrap");
    const progressFill = bodyEl.querySelector("#uploadProgressFill");
    const progressLabel = bodyEl.querySelector("#uploadProgressLabel");
    if (files.length) progressWrap.hidden = false;

    try {
      const outcome = await submitRequestForm(payload, submissionKey, (percent) => {
        progressFill.style.width = `${percent}%`;
        progressLabel.textContent = `${percent}%`;
      });
      showSubmitted(outcome, { serviceName: item.name, phone: raw.get("phone"), travelerCount });
    } catch (error) {
      setLoading(submitBtn, false);
      progressWrap.hidden = true;
      if (error instanceof ApiError && error.errors) {
        toast("تحقق من الحقول المظللة وحاول مرة أخرى.", { tone: "error" });
        applyFieldErrors(form, error.errors);
      } else {
        toast(submitFailureMessage(error), { tone: "error" });
      }
    }
  });
}

function applyFieldErrors(form, errors) {
  const fieldErrors = errors?.fieldErrors || {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!messages?.length) continue;
    const input = form.querySelector(`[name="${CSS.escape(field)}"]`);
    const container = input?.closest(".field");
    if (container) container.insertAdjacentHTML("beforeend", fieldError(messages[0]));
  }
}

// Shown only after the server returned the stored request's id (see
// submission.js). The reference alone never opens the request's details:
// tracking needs the phone + WhatsApp code (or the signed-in account).
export function renderRequestSubmittedScreen({ bodyEl, params }) {
  const reference = params.id || "";
  bodyEl.innerHTML = `
    <div class="success-card">
      <div class="success-icon">${icon("check-circle", { size: 40 })}</div>
      <h2>تم استلام طلبك</h2>
      <p>وصل طلب «${esc(params.serviceName || "")}» إلى فريق نسائم الحرمين وتم حفظه. سنتواصل معك بعد المراجعة.</p>
      <div class="reference-box">
        <span>الرقم المرجعي</span>
        <code id="requestReference" dir="ltr">${esc(reference)}</code>
        <button type="button" class="chip-btn" id="copyReferenceBtn">${icon("document", { size: 16 })}<span>نسخ الرقم</span></button>
      </div>
      <p class="field-hint confirmation-notice" id="confirmationNotice">${esc(confirmationNotice(params.customerConfirmation))}</p>
      <button class="primary" id="trackRequestBtn">${icon("requests", { size: 18 })}<span>تتبع الطلب</span></button>
      <button class="secondary" id="goToHomeBtn">العودة للرئيسية</button>
    </div>
  `;
  bodyEl.querySelector("#copyReferenceBtn").addEventListener("click", async () => {
    const copied = await copyText(reference);
    toast(copied ? "تم نسخ الرقم المرجعي" : "تعذر النسخ، يمكنك تحديد الرقم ونسخه يدويًا", { tone: copied ? "default" : "error" });
  });
  bodyEl.querySelector("#trackRequestBtn").addEventListener("click", () => {
    if (params.phone) setTrackingPrefill(params.phone);
    goToTab("requests", "requests", { title: "طلباتي" });
  });
  bodyEl.querySelector("#goToHomeBtn").addEventListener("click", () => goToTab("home", "home", { title: "" }));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
