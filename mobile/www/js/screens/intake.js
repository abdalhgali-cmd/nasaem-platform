import { api, ApiError } from "../api.js";
import { esc, toast, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import { goToTab } from "../router.js";
import { getCustomer, isAccountUnlocked } from "../auth.js";
import { newSubmissionKey, submitRequestForm, submitFailureMessage, showSubmitted } from "../submission.js";
import { confirmationNotice, parseRequirementsResponse } from "../experience-core.js";
import {
  MAX_DOCUMENTS, MAX_TRAVELERS, requirementApplies, travelerLabel, buildDocumentSlots, validateFile, validateContact,
  validateTravelers, validateSlots, buildUploadParts, collectAnswers, missingAnswers, draftKey, serializeDraft, parseDraft,
} from "../intake-core.js";
import { setTrackingPrefill } from "../tracking.js";
import { fixedPricing, fixedTotalSummary, withServerPrice } from "../pricing-view.js";
import { umrahNeedsGuarantor, validateUmrahContacts } from "../umrah-view.js";
import { selectOptions } from "../egypt-view.js";

const ALLOWED_DOC_ACCEPT = "image/*,.pdf";
const STEP_TITLES = { data: "البيانات", docs: "المستندات", review: "المراجعة" };

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

function readDraft(key) {
  try {
    return parseDraft(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeDraft(key, values) {
  try {
    localStorage.setItem(key, serializeDraft(values));
  } catch {
    // The draft is a convenience; a full or blocked storage never blocks the form.
  }
}

function clearDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function answerInput(requirement, value) {
  const name = `req_${requirement.id}`;
  const label = esc(requirement.name) + (requirement.required ? " *" : "");
  const hint = requirement.description ? `<span class="field-hint">${esc(requirement.description)}</span>` : "";
  if (requirement.type === "SELECT") {
    // Each option's Arabic label is shown and its stable value is submitted.
    const options = selectOptions(requirement.options);
    return `
      <label class="field" data-req="${esc(requirement.id)}">
        <span>${label}</span>
        <select name="${name}"><option value="">اختر</option>${options.map((option) => `<option value="${esc(option.value)}" ${String(value) === option.value ? "selected" : ""}>${esc(option.label)}</option>`).join("")}</select>
        ${hint}
      </label>`;
  }
  if (requirement.type === "YES_NO") {
    return `
      <label class="field" data-req="${esc(requirement.id)}">
        <span>${label}</span>
        <select name="${name}"><option value="">اختر</option><option value="true" ${String(value) === "true" ? "selected" : ""}>نعم</option><option value="false" ${String(value) === "false" ? "selected" : ""}>لا</option></select>
        ${hint}
      </label>`;
  }
  const type = requirement.type === "NUMBER" ? "number" : requirement.type === "DATE" ? "date" : "text";
  return `
    <label class="field" data-req="${esc(requirement.id)}">
      <span>${label}</span>
      <input name="${name}" type="${type}" value="${esc(value ?? "")}">
      ${hint}
    </label>`;
}

function travelerFieldset(index, traveler) {
  return `
    <fieldset class="traveler-card" data-traveler="${index}">
      <legend>المسافر ${index + 1}${index === 0 ? " (صاحب الطلب)" : ""}</legend>
      <label class="field">
        <span>الاسم كما في جواز السفر *</span>
        <input name="t_name_${index}" value="${esc(traveler.fullName || "")}" autocomplete="off">
      </label>
      <div class="field-row">
        <label class="field">
          <span>رقم الجواز</span>
          <input name="t_pass_${index}" value="${esc(traveler.passportNo || "")}" autocomplete="off" dir="ltr">
        </label>
        <label class="field">
          <span>الجنسية</span>
          <input name="t_nat_${index}" value="${esc(traveler.nationality || "")}">
        </label>
      </div>
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

// The one requirement-driven request screen behind every service's "ابدأ
// الطلب" button. Three steps: data (contact, travelers, the agency's own
// questions) -> documents (one slot per document and, where the agency asks
// for it, per traveler) -> review and send. The fields are never generic: they
// come from that service's checklist, managed in the back-office.
// `selection` (optional): what the customer already picked before the form,
// e.g. a flight — { summary, details }. It is shown and sent with the request.
export async function renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers = true, selection = null, fallbackRequirementsItem = null }) {
  setTitle(`طلب ${item.name}`);
  bodyEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 28 })}<p>جارٍ تحميل متطلبات الخدمة…</p></div>`;

  let requirements;
  try {
    requirements = await fetchRequirements(item);
    // A package the agency has not given its own checklist falls back to the
    // checklist of the parent service (e.g. the Umrah service's passport/sponsor).
    if (!requirements.length && fallbackRequirementsItem) requirements = await fetchRequirements(fallbackRequirementsItem);
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
      renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers, selection, fallbackRequirementsItem })
    );
    return;
  }

  const maxTravelers = allowMultipleTravelers ? MAX_TRAVELERS : 1;
  const customer = isAccountUnlocked() ? getCustomer() : null;
  // One key for this form, reused on every retry (no duplicate requests).
  const submissionKey = newSubmissionKey();
  const storageKey = draftKey(item);

  const state = {
    step: "data",
    files: new Map(),
    values: {
      name: customer?.fullName || "",
      phone: customer?.phone || "",
      email: customer?.email || "",
      notes: `طلب ${item.name}`,
      travelers: [{ fullName: customer?.fullName || "", passportNo: "", nationality: "" }],
      answers: {},
      guarantorPhone: "",
      extraContactName: "",
      extraContactPhone: "",
    },
  };
  const needsGuarantor = umrahNeedsGuarantor(item);
  const draft = readDraft(storageKey);
  const restored = Boolean(draft);
  if (draft) Object.assign(state.values, draft.values, { travelers: draft.values.travelers?.length ? draft.values.travelers : state.values.travelers });
  state.values.travelers = state.values.travelers.slice(0, maxTravelers);

  // Fixed catalog price (explicit agency setting): the review step shows the
  // final total and the order is confirmed at that total. Updated if the
  // server answers that the price changed meanwhile.
  let pricingItem = item;
  const pricing = () => fixedPricing(pricingItem);

  const hasDocumentRequirements = requirements.some((requirement) => requirement.type === "DOCUMENT");
  const answerRequirements = () => requirements.filter((requirement) => requirement.type !== "DOCUMENT" && requirementApplies(requirement, state.values.answers));
  const slots = () => buildDocumentSlots(requirements, state.values.answers, state.values.travelers);
  const steps = () => ["data", ...(hasDocumentRequirements ? ["docs"] : []), "review"];

  let saveTimer = 0;
  const saveDraft = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeDraft(storageKey, state.values), 400);
  };

  bodyEl.innerHTML = `
    <div class="intake">
      <ol class="stepper" id="stepper" aria-label="خطوات الطلب"></ol>
      ${selection ? `<section class="selection-card"><h3>${icon("check-circle", { size: 18 })} اختيارك</h3><p>${esc(selection.summary)}</p></section>` : ""}
      ${restored ? `<p class="draft-note" id="draftNote">${icon("info", { size: 15 })} استعدنا ما كتبته سابقًا في هذا الطلب. الملفات تُختار من جديد. <button type="button" class="link-btn" id="discardDraftBtn">ابدأ من جديد</button></p>` : ""}
      <div id="stepBody"></div>
      <p class="step-errors" id="stepErrors" role="alert" hidden></p>
      <div class="step-actions" id="stepActions"></div>
    </div>`;

  const stepBody = bodyEl.querySelector("#stepBody");
  const stepErrors = bodyEl.querySelector("#stepErrors");
  const stepActions = bodyEl.querySelector("#stepActions");
  const stepper = bodyEl.querySelector("#stepper");

  bodyEl.querySelector("#discardDraftBtn")?.addEventListener("click", () => {
    clearDraft(storageKey);
    renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers, selection, fallbackRequirementsItem });
  });

  function showErrors(messages) {
    stepErrors.hidden = !messages.length;
    stepErrors.innerHTML = messages.map((message) => `<span>${esc(message)}</span>`).join("");
    if (messages.length) stepErrors.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---- reading the visible fields back into state
  function syncData() {
    // Only the data step has these inputs; on other steps the stored values stand.
    if (!bodyEl.querySelector('[name="name"]')) return;
    const read = (name) => bodyEl.querySelector(`[name="${name}"]`)?.value ?? "";
    state.values.name = read("name").trim();
    state.values.phone = read("phone").trim();
    state.values.email = read("email").trim();
    if (needsGuarantor) {
      state.values.guarantorPhone = read("guarantorPhone").trim();
      state.values.extraContactName = read("extraContactName").trim();
      state.values.extraContactPhone = read("extraContactPhone").trim();
    }
    const count = Math.max(1, Math.min(maxTravelers, Number(read("travelerCount")) || state.values.travelers.length));
    const travelers = [];
    for (let i = 0; i < count; i += 1) {
      const existing = state.values.travelers[i] || {};
      travelers.push({
        fullName: bodyEl.querySelector(`[name="t_name_${i}"]`) ? read(`t_name_${i}`).trim() : existing.fullName || "",
        passportNo: bodyEl.querySelector(`[name="t_pass_${i}"]`) ? read(`t_pass_${i}`).trim() : existing.passportNo || "",
        nationality: bodyEl.querySelector(`[name="t_nat_${i}"]`) ? read(`t_nat_${i}`).trim() : existing.nationality || "",
      });
    }
    state.values.travelers = travelers;
    const raw = {};
    for (const requirement of requirements) {
      if (requirement.type === "DOCUMENT") continue;
      const el = bodyEl.querySelector(`[name="req_${requirement.id}"]`);
      if (el) raw[requirement.id] = el.value;
      else if (state.values.answers[requirement.id] !== undefined) raw[requirement.id] = state.values.answers[requirement.id];
    }
    state.values.answers = collectAnswers(requirements, raw);
    saveDraft();
  }

  // ---- step renderers
  function renderStepper() {
    const list = steps();
    stepper.innerHTML = list
      .map((key, index) => `<li class="${key === state.step ? "current" : list.indexOf(state.step) > index ? "done" : ""}"><span class="step-dot">${list.indexOf(state.step) > index ? icon("check", { size: 14 }) : index + 1}</span><span class="step-name">${key === "review" && pricing() ? "الإجمالي والتأكيد" : STEP_TITLES[key]}</span></li>`)
      .join("");
  }

  function renderActions() {
    const list = steps();
    const index = list.indexOf(state.step);
    const last = index === list.length - 1;
    stepActions.innerHTML = `
      ${index > 0 ? `<button type="button" class="secondary" id="backStepBtn">السابق</button>` : ""}
      <button type="button" class="primary" id="nextStepBtn">${last ? (pricing() ? "تأكيد الطلب بهذا الإجمالي" : "إرسال الطلب للوكالة") : "التالي"}</button>`;
    stepActions.querySelector("#backStepBtn")?.addEventListener("click", () => goStep(list[index - 1], { validate: false }));
    stepActions.querySelector("#nextStepBtn").addEventListener("click", () => (last ? submit() : goStep(list[index + 1], { validate: true })));
  }

  function renderData() {
    const v = state.values;
    stepBody.innerHTML = `
      <section class="form-section">
        <h3>بيانات التواصل</h3>
        <p class="field-hint">لا تحتاج إلى حساب. نستخدم رقم هاتفك للتواصل معك ولمتابعة طلبك برمز تحقق عبر واتساب.</p>
        <label class="field"><span>${needsGuarantor ? "اسم مقدم الطلب *" : "الاسم الكامل *"}</span><input name="name" value="${esc(v.name)}" autocomplete="name"></label>
        <div class="field-row">
          <label class="field"><span>رقم الهاتف *</span><input name="phone" inputmode="tel" dir="ltr" value="${esc(v.phone)}" autocomplete="tel"></label>
          <label class="field"><span>البريد الإلكتروني (اختياري)</span><input name="email" type="email" dir="ltr" value="${esc(v.email)}" autocomplete="email"></label>
        </div>
      </section>
      ${needsGuarantor ? `
        <section class="form-section" id="umrahContactsSection">
          <h3>الضامن وجهة اتصال إضافية</h3>
          <label class="field"><span>رقم هاتف الضامن *</span><input name="guarantorPhone" inputmode="tel" dir="ltr" value="${esc(v.guarantorPhone || "")}" autocomplete="off"></label>
          <p class="field-hint">صاحب الإقامة التي ترفعها في خطوة المستندات.</p>
          <div class="field-row">
            <label class="field"><span>جهة اتصال إضافية (اختياري)</span><input name="extraContactName" value="${esc(v.extraContactName || "")}" autocomplete="off"></label>
            <label class="field"><span>هاتفها</span><input name="extraContactPhone" inputmode="tel" dir="ltr" value="${esc(v.extraContactPhone || "")}" autocomplete="off"></label>
          </div>
        </section>` : ""}
      <section class="form-section">
        <h3>المسافرون</h3>
        <label class="field">
          <span>عدد المسافرين *</span>
          <input id="travelerCount" name="travelerCount" type="number" min="1" max="${maxTravelers}" value="${v.travelers.length}" ${allowMultipleTravelers ? "" : "readonly"}>
        </label>
        <div id="travelersBox">${v.travelers.map((traveler, index) => travelerFieldset(index, traveler)).join("")}</div>
        <p class="field-hint">لكل مسافر مستنداته الخاصة في الخطوة التالية، ولا يمكن رفع مستند مسافر على مسافر آخر.</p>
      </section>
      ${answerRequirements().length ? `
        <section class="form-section" id="answersSection">
          <h3>معلومات يطلبها فريق الوكالة</h3>
          ${answerRequirements().map((requirement) => answerInput(requirement, v.answers[requirement.id])).join("")}
        </section>` : ""}`;

    const countInput = stepBody.querySelector("#travelerCount");
    countInput.addEventListener("change", () => {
      syncData();
      const count = Math.max(1, Math.min(maxTravelers, Number(countInput.value) || 1));
      while (state.values.travelers.length < count) state.values.travelers.push({ fullName: "", passportNo: "", nationality: "" });
      state.values.travelers = state.values.travelers.slice(0, count);
      // A removed traveler's files go with them.
      for (const key of [...state.files.keys()]) {
        const [, index] = key.split("::");
        if (index !== undefined && Number(index) >= count) state.files.delete(key);
      }
      renderData();
      saveDraft();
    });
    stepBody.addEventListener("input", saveDraftSoon);
    stepBody.addEventListener("change", () => {
      syncData();
      // An answer can reveal or hide another question (conditional requirements).
      const visibleNow = answerRequirements().map((requirement) => requirement.id).join(",");
      if (visibleNow !== stepBody.dataset.visible) {
        stepBody.dataset.visible = visibleNow;
        const focused = document.activeElement?.getAttribute?.("name");
        renderData();
        if (focused) stepBody.querySelector(`[name="${CSS.escape(focused)}"]`)?.focus();
      }
    });
    stepBody.dataset.visible = answerRequirements().map((requirement) => requirement.id).join(",");
  }

  function saveDraftSoon() {
    syncData();
  }

  function slotRow(slot) {
    const file = state.files.get(slot.key);
    const requirement = slot.requirement;
    return `
      <div class="slot ${file ? "slot-ok" : ""}" data-slot="${esc(slot.key)}">
        <div class="slot-main">
          <b>${esc(slot.label)}${requirement.required ? ' <i class="req-star">*</i>' : ' <small>(اختياري)</small>'}</b>
          ${requirement.description ? `<span class="field-hint">${esc(requirement.description)}</span>` : ""}
          <span class="slot-file">${file ? `${icon("check", { size: 14 })} ${esc(file.name)} · ${formatBytes(file.size)}` : "لم يُختر ملف بعد"}</span>
          <span class="field-error slot-error" hidden></span>
        </div>
        <div class="slot-actions">
          <label class="chip-btn slot-pick">${icon("upload", { size: 16 })}<span>${file ? "تغيير" : "اختيار"}</span>
            <input type="file" class="sr-only" accept="${requirement.allowedMimeTypes?.length ? esc(requirement.allowedMimeTypes.join(",")) : ALLOWED_DOC_ACCEPT}" data-slot-input="${esc(slot.key)}">
          </label>
          ${file ? `<button type="button" class="chip-btn slot-remove" data-slot-remove="${esc(slot.key)}">${icon("close", { size: 14 })}<span>إزالة</span></button>` : ""}
        </div>
      </div>`;
  }

  function renderDocs() {
    const list = slots();
    // Group: each traveler's documents together, then the request-wide ones.
    const groups = [];
    state.values.travelers.forEach((_, index) => {
      const own = list.filter((slot) => slot.travelerIndex === index);
      if (own.length) groups.push({ title: travelerLabel(state.values.travelers, index), slots: own });
    });
    const shared = list.filter((slot) => slot.travelerIndex === null);
    if (shared.length) groups.push({ title: "مستندات الطلب", slots: shared });
    const total = list.filter((slot) => state.files.get(slot.key)).length;
    stepBody.innerHTML = `
      <p class="field-hint">صورة واضحة أو ملف PDF، حتى 10 ميغابايت للملف. المرفقات الآن: ${total} من ${MAX_DOCUMENTS} كحد أقصى.</p>
      ${groups.map((group) => `<section class="form-section"><h3>${esc(group.title)}</h3>${group.slots.map(slotRow).join("")}</section>`).join("")}`;
    stepBody.querySelectorAll("[data-slot-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const slot = list.find((candidate) => candidate.key === input.dataset.slotInput);
        const file = input.files?.[0];
        if (!slot || !file) return;
        const error = validateFile(file, slot.requirement);
        if (error) {
          const row = input.closest(".slot");
          const errorEl = row.querySelector(".slot-error");
          errorEl.textContent = error;
          errorEl.hidden = false;
          input.value = "";
          return;
        }
        state.files.set(slot.key, file);
        renderDocs();
      });
    });
    stepBody.querySelectorAll("[data-slot-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        state.files.delete(button.dataset.slotRemove);
        renderDocs();
      });
    });
  }

  function renderReview() {
    const v = state.values;
    const list = slots();
    const fileFor = (slot) => state.files.get(slot.key);
    stepBody.innerHTML = `
      <section class="form-section review">
        <h3>راجع طلبك قبل الإرسال</h3>
        <div class="review-row"><span>الخدمة</span><b>${esc(item.name)}</b></div>
        <div class="review-row"><span>الاسم</span><b>${esc(v.name)}</b></div>
        <div class="review-row"><span>الهاتف</span><b dir="ltr">${esc(v.phone)}</b></div>
        ${v.email ? `<div class="review-row"><span>البريد</span><b dir="ltr">${esc(v.email)}</b></div>` : ""}
        ${needsGuarantor ? `<div class="review-row"><span>هاتف الضامن</span><b dir="ltr" id="reviewGuarantorPhone">${esc(v.guarantorPhone)}</b></div>` : ""}
        ${needsGuarantor && v.extraContactPhone ? `<div class="review-row"><span>جهة اتصال إضافية</span><b>${esc(v.extraContactName ? `${v.extraContactName} — ` : "")}<bdi>${esc(v.extraContactPhone)}</bdi></b></div>` : ""}
      </section>
      ${v.travelers.map((traveler, index) => `
        <section class="form-section review">
          <h3>${esc(travelerLabel(v.travelers, index))}</h3>
          ${traveler.passportNo ? `<div class="review-row"><span>رقم الجواز</span><b dir="ltr">${esc(traveler.passportNo)}</b></div>` : ""}
          ${traveler.nationality ? `<div class="review-row"><span>الجنسية</span><b>${esc(traveler.nationality)}</b></div>` : ""}
          ${list.filter((slot) => slot.travelerIndex === index).map((slot) => `<div class="review-row"><span>${esc(slot.requirement.name)}</span><b>${fileFor(slot) ? esc(fileFor(slot).name) : "لم يُرفع"}</b></div>`).join("")}
        </section>`).join("")}
      ${list.some((slot) => slot.travelerIndex === null) ? `
        <section class="form-section review">
          <h3>مستندات الطلب</h3>
          ${list.filter((slot) => slot.travelerIndex === null).map((slot) => `<div class="review-row"><span>${esc(slot.requirement.name)}</span><b>${fileFor(slot) ? esc(fileFor(slot).name) : "لم يُرفع"}</b></div>`).join("")}
        </section>` : ""}
      ${answerRequirements().some((requirement) => v.answers[requirement.id] !== undefined) ? `
        <section class="form-section review">
          <h3>معلومات إضافية</h3>
          ${answerRequirements().filter((requirement) => v.answers[requirement.id] !== undefined).map((requirement) => `<div class="review-row"><span>${esc(requirement.name)}</span><b>${esc(typeof v.answers[requirement.id] === "boolean" ? (v.answers[requirement.id] ? "نعم" : "لا") : v.answers[requirement.id])}</b></div>`).join("")}
        </section>` : ""}
      <section class="form-section">
        <label class="field"><span>ملاحظات إضافية</span><textarea name="notes" rows="3">${esc(v.notes)}</textarea></label>
        <p class="field-hint">لا يُعد الطلب مُرسلًا إلا بعد أن يظهر لك رقم الطلب.${pricing() ? "" : " السعر النهائي وتعليمات الدفع تصلك بعد مراجعة الوكالة."}</p>
      </section>
      ${totalReviewHtml()}
      <div id="uploadProgressWrap" class="upload-progress-wrap" hidden>
        <div class="upload-progress-bar"><div id="uploadProgressFill" class="upload-progress-fill"></div></div>
        <span id="uploadProgressLabel">0%</span>
      </div>`;
    stepBody.querySelector('[name="notes"]').addEventListener("input", (event) => {
      state.values.notes = event.target.value;
      saveDraft();
    });
  }

  // Fixed price: the final total, how it is made up and when it is paid,
  // and an explicit confirmation. Accepting it here is the price approval;
  // no second approval follows.
  function totalReviewHtml() {
    const current = pricing();
    if (!current) return "";
    const summary = fixedTotalSummary(current, state.values.travelers.length);
    return `
      <section class="form-section review total-review" id="fixedTotalReview" aria-labelledby="fixedTotalTitle">
        <h3 id="fixedTotalTitle">الإجمالي النهائي</h3>
        <div class="review-row"><span>${esc(summary.breakdown)}</span><b id="fixedTotalAmount"><bdi>${esc(summary.totalText)}</bdi></b></div>
        ${summary.sdgText ? `<p class="field-hint" id="fixedTotalSdg">${esc(summary.sdgText)}</p>` : ""}
        <p class="field-hint">${esc(summary.payment)}</p>
        <label class="confirm-check"><input type="checkbox" id="confirmTotal"> <span>أؤكد طلبي بإجمالي <bdi>${esc(summary.totalText)}</bdi>.</span></label>
      </section>`;
  }

  function validateStep(step) {
    if (step === "data") {
      syncData();
      const messages = [
        ...Object.values(validateContact(state.values)),
        ...(needsGuarantor ? validateUmrahContacts(state.values) : []),
        ...Object.values(validateTravelers(state.values.travelers)),
        ...missingAnswers(requirements, state.values.answers).filter((m) => answerRequirements().some((r) => r.id === m.key)).map((m) => m.message),
      ];
      return messages;
    }
    if (step === "docs") return validateSlots(slots(), state.files).map((problem) => problem.message);
    return [];
  }

  function goStep(step, { validate }) {
    if (validate) {
      const messages = validateStep(state.step);
      showErrors(messages);
      if (messages.length) return;
    } else {
      if (state.step === "data") syncData();
      showErrors([]);
    }
    state.step = step;
    showErrors([]);
    renderStepper();
    if (step === "data") renderData();
    else if (step === "docs") renderDocs();
    else renderReview();
    renderActions();
    bodyEl.scrollIntoView({ block: "start" });
  }

  async function submit() {
    const notes = stepBody.querySelector('[name="notes"]')?.value ?? state.values.notes;
    state.values.notes = notes;
    const messages = [...validateStep("data"), ...validateStep("docs")];
    const fixed = pricing() ? fixedTotalSummary(pricing(), state.values.travelers.length) : null;
    if (fixed && !stepBody.querySelector("#confirmTotal")?.checked) messages.push("أكّد الإجمالي النهائي قبل إرسال الطلب.");
    showErrors(messages);
    if (messages.length) return;

    const v = state.values;
    const parts = buildUploadParts(slots(), state.files);
    const submitBtn = stepActions.querySelector("#nextStepBtn");
    setLoading(submitBtn, true, "جارٍ الإرسال…");

    const travelers = v.travelers.map((traveler, index) => ({ fullName: traveler.fullName, passportNo: traveler.passportNo || "", nationality: traveler.nationality || "", isPrimary: index === 0 }));
    const payload = new FormData();
    payload.set("name", v.name);
    payload.set("phone", v.phone);
    if (v.email) payload.set("email", v.email);
    if (needsGuarantor) {
      payload.set("guarantorPhone", v.guarantorPhone);
      if (v.extraContactPhone) {
        payload.set("extraContactName", v.extraContactName || "");
        payload.set("extraContactPhone", v.extraContactPhone);
      }
    }
    payload.set("service", item.name);
    if (item.id) payload.set(item.isVisaType ? "visaTypeId" : "serviceId", item.id);
    if (item.serviceId) payload.set("serviceId", item.serviceId);
    const message = notes.trim() || `طلب ${item.name}`;
    payload.set("message", selection ? `${message}\n${selection.summary}` : message);
    payload.set("travelerCount", String(travelers.length));
    if (fixed) {
      payload.set("acceptedTotal", String(fixed.total));
      payload.set("acceptedCurrency", fixed.currency);
    }
    payload.set("travelers", JSON.stringify(travelers));
    payload.set("answers", JSON.stringify(v.answers));
    payload.set("intakeData", JSON.stringify({ travelers, answers: v.answers, notes, ...(selection ? { selection: selection.details || { summary: selection.summary } } : {}) }));
    payload.set("documentLabels", JSON.stringify(parts.labels));
    payload.set("documentTravelerIndexes", JSON.stringify(parts.travelerIndexes));
    payload.set("documentRequirementIds", JSON.stringify(parts.requirementIds));
    parts.files.forEach((file) => payload.append("documents", file));

    const progressWrap = stepBody.querySelector("#uploadProgressWrap");
    const progressFill = stepBody.querySelector("#uploadProgressFill");
    const progressLabel = stepBody.querySelector("#uploadProgressLabel");
    if (parts.files.length && progressWrap) progressWrap.hidden = false;

    try {
      const outcome = await submitRequestForm(payload, submissionKey, (percent) => {
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressLabel) progressLabel.textContent = `${percent}%`;
      });
      // Only now - with the server's confirmation in hand - is the draft dropped.
      clearDraft(storageKey);
      showSubmitted(outcome, { serviceName: item.name, phone: v.phone, travelerCount: travelers.length, payNow: Boolean(fixed && !pricing()?.paymentAfterDocumentReview) });
    } catch (error) {
      setLoading(submitBtn, false);
      if (progressWrap) progressWrap.hidden = true;
      saveDraft();
      // The agency changed the price (or moved the service to quotation)
      // after this screen loaded: nothing was created. Show the current
      // terms and ask for a fresh confirmation.
      if (error instanceof ApiError && (error.code === "PRICE_CHANGED" || error.code === "PRICING_MODE_CHANGED")) {
        pricingItem = error.code === "PRICE_CHANGED" ? withServerPrice(pricingItem, error.details) : { ...pricingItem, pricingMode: "QUOTE" };
        renderStepper();
        renderReview();
        renderActions();
        showErrors([error.message]);
        return;
      }
      showErrors([submitFailureMessage(error)]);
      toast(submitFailureMessage(error), { tone: "error" });
    }
  }

  renderStepper();
  renderData();
  renderActions();
}

// Shown only after the server returned the stored request's id (see
// submission.js). The reference alone never opens the request's details:
// tracking needs the phone + WhatsApp code (or the signed-in account).
export function renderRequestSubmittedScreen({ bodyEl, params }) {
  const reference = params.id || "";
  const payment = params.paymentSummary;
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
      ${payment ? `
        <div class="review-row"><span>حالة الطلب</span><b id="submittedRequestStatus">${esc(payment.statusLabel || "")}</b></div>
        <div class="review-row"><span>حالة الدفع</span><b id="submittedPaymentStatus">${esc(payment.paymentStatusLabel || "")}</b></div>
        ${payment.paymentStatus === "UNDER_REVIEW" ? `<p class="field-hint">يراجع موظف مختص التحويل ويؤكد السداد، ويصلك إشعار عند تغيّر الحالة.</p>` : ""}` : ""}
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
