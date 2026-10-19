import { api, ApiError } from "../api.js";
import { esc, toast, setLoading, confirmDialog } from "../ui.js";
import { icon } from "../icons.js";
import { goToTab } from "../router.js";
import { getCustomer, isAccountUnlocked } from "../auth.js";
import { newSubmissionKey, submitRequestForm, submitFailureMessage, showSubmitted } from "../submission.js";
import { confirmationNotice, parseRequirementsResponse } from "../experience-core.js";
import {
  MAX_TRAVELERS, requirementApplies, buildDocumentSlots, validateFile, validateContact, removeTravelerFiles,
  validateTravelers, validateSlots, buildUploadParts, collectAnswers, missingAnswers, draftKey, serializeDraft, parseDraft,
} from "../intake-core.js";
import { setTrackingPrefill } from "../tracking.js";
import { fixedPricing, fixedTotalSummary, withServerPrice } from "../pricing-view.js";
import { isUmrahPackage, umrahNeedsGuarantor, validateUmrahContacts } from "../umrah-view.js";
import { EGYPT_AIR_ROUTE_DEFAULTS, egyptVariantEntryMode, validateEgyptRoute } from "../egypt-view.js";
import { selectOptions } from "../egypt-view.js";

const ALLOWED_DOC_ACCEPT = "image/*,.pdf";

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

// The one requirement-driven request screen behind every service: everything
// the request needs on ONE screen, in the order the customer has it to hand —
// the travelers (each with their own documents), the trip details, the
// request-wide documents (for Umrah: the guarantor), how to reach the
// customer, the agency's own questions, and for a fixed price the total with
// an explicit confirmation beside the send button. The fields are never
// generic: they come from that service's checklist, managed in the
// back-office.
// `selection` (optional): what the customer already picked before the form,
// e.g. a flight — { summary, details }. It is shown and sent with the request.
// `initialTravelers`: how many travelers the customer already said (flights).
// `showSelection`: false when the choice is already visible on the same screen (Umrah).
export async function renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers = true, selection = null, fallbackRequirementsItem = null, initialTravelers = 1, showSelection = true }) {
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
      renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers, selection, fallbackRequirementsItem, initialTravelers, showSelection })
    );
    return;
  }

  const maxTravelers = allowMultipleTravelers ? MAX_TRAVELERS : 1;
  const customer = isAccountUnlocked() ? getCustomer() : null;
  // One key for this form, reused on every retry (no duplicate requests).
  const submissionKey = newSubmissionKey();
  const storageKey = draftKey(item);
  const needsGuarantor = umrahNeedsGuarantor(item);
  // Egypt clearance variant: its entry method decides the route fields.
  const egyptMode = egyptVariantEntryMode(item);
  const travelerWord = needsGuarantor ? "المعتمر" : "المسافر";
  const fixedOnly = Boolean(egyptMode) || isUmrahPackage(item);
  const startCount = Math.max(1, Math.min(maxTravelers, Math.floor(Number(initialTravelers) || 1)));

  const state = {
    files: new Map(),
    values: {
      name: customer?.fullName || "",
      phone: customer?.phone || "",
      // Not asked on the form; a signed-in customer's own address still goes with the request.
      email: customer?.email || "",
      notes: "",
      travelers: Array.from({ length: startCount }, (_, index) => ({ fullName: index === 0 ? customer?.fullName || "" : "", passportNo: "", nationality: "" })),
      answers: {},
      guarantorPhone: "",
      departureCity: EGYPT_AIR_ROUTE_DEFAULTS.departureCity,
      arrivalAirport: EGYPT_AIR_ROUTE_DEFAULTS.arrivalAirport,
      entryPort: "",
    },
  };
  const draft = readDraft(storageKey);
  const restored = Boolean(draft);
  if (draft) Object.assign(state.values, draft.values, { travelers: draft.values.travelers?.length ? draft.values.travelers : state.values.travelers });
  state.values.travelers = state.values.travelers.slice(0, maxTravelers);

  // Fixed catalog price (explicit agency setting): the total is shown beside
  // the send button and the order is confirmed at that total. Updated if the
  // server answers that the price changed meanwhile.
  let pricingItem = item;
  const pricing = () => fixedPricing(pricingItem);

  const answerRequirements = () => requirements.filter((requirement) => requirement.type !== "DOCUMENT" && requirementApplies(requirement, state.values.answers));
  const slots = () => buildDocumentSlots(requirements, state.values.answers, state.values.travelers);

  let saveTimer = 0;
  const saveDraft = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeDraft(storageKey, state.values), 400);
  };
  // A pending write must never bring back a draft that was just removed.
  const dropDraft = () => {
    clearTimeout(saveTimer);
    clearDraft(storageKey);
  };
  // While sending, the form is frozen (one payload per submission key). After
  // a «fixed price no longer available» refusal it stays closed.
  let submitting = false;
  let pricingBlocked = false;
  // What is on screen depends on the answers: the questions AND the upload slots.
  const visibleSignature = () => [...answerRequirements().map((requirement) => requirement.id), "|", ...slots().map((slot) => slot.key)].join(",");

  bodyEl.innerHTML = `
    <div class="intake intake-single">
      ${selection && showSelection ? `<section class="selection-card"><h3>${icon("check-circle", { size: 18 })} اختيارك</h3><p>${esc(selection.summary)}</p></section>` : ""}
      ${restored ? `<p class="draft-note" id="draftNote">${icon("info", { size: 15 })} استعدنا ما كتبته سابقًا. الملفات تُختار من جديد. <button type="button" class="link-btn" id="discardDraftBtn">ابدأ من جديد</button></p>` : ""}
      <div id="stepBody"></div>
      <p class="step-errors" id="stepErrors" role="alert" hidden></p>
      <div class="step-actions" id="stepActions"></div>
    </div>`;

  const stepBody = bodyEl.querySelector("#stepBody");
  const stepErrors = bodyEl.querySelector("#stepErrors");
  const stepActions = bodyEl.querySelector("#stepActions");

  bodyEl.querySelector("#discardDraftBtn")?.addEventListener("click", () => {
    dropDraft();
    renderIntakeScreen({ bodyEl, setTitle, item, allowMultipleTravelers, selection, fallbackRequirementsItem, initialTravelers, showSelection });
  });

  function showErrors(messages) {
    stepErrors.hidden = !messages.length;
    stepErrors.innerHTML = messages.map((message) => `<span>${esc(message)}</span>`).join("");
    if (messages.length) stepErrors.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---- reading the visible fields back into state
  function syncData() {
    const read = (name) => stepBody.querySelector(`[name="${name}"]`)?.value ?? "";
    if (!stepBody.querySelector('[name="name"]')) return;
    state.values.name = read("name").trim();
    state.values.phone = read("phone").trim();
    if (needsGuarantor) state.values.guarantorPhone = read("guarantorPhone").trim();
    if (egyptMode === "AIR") {
      state.values.departureCity = read("departureCity").trim();
      state.values.arrivalAirport = read("arrivalAirport").trim();
    } else if (egyptMode === "BORDER") {
      state.values.entryPort = read("entryPort").trim();
    }
    state.values.travelers = state.values.travelers.map((traveler, index) => ({
      ...traveler,
      fullName: stepBody.querySelector(`[name="t_name_${index}"]`) ? read(`t_name_${index}`).trim() : traveler.fullName || "",
    }));
    if (stepBody.querySelector('[name="notes"]')) state.values.notes = read("notes");
    const raw = {};
    for (const requirement of requirements) {
      if (requirement.type === "DOCUMENT") continue;
      const el = stepBody.querySelector(`[name="req_${requirement.id}"]`);
      if (el) raw[requirement.id] = el.value;
      else if (state.values.answers[requirement.id] !== undefined) raw[requirement.id] = state.values.answers[requirement.id];
    }
    state.values.answers = collectAnswers(requirements, raw);
    saveDraft();
  }

  function slotRow(slot, label = slot.requirement.name) {
    const file = state.files.get(slot.key);
    const requirement = slot.requirement;
    return `
      <div class="slot ${file ? "slot-ok" : ""}" data-slot="${esc(slot.key)}">
        <div class="slot-main">
          <b>${esc(label)}${requirement.required ? ' <i class="req-star">*</i>' : ' <small>(اختياري)</small>'}</b>
          ${requirement.description ? `<span class="field-hint">${esc(requirement.description)}</span>` : ""}
          <span class="slot-file">${file ? `${icon("check", { size: 14 })} ${esc(file.name)} · ${formatBytes(file.size)}` : "صورة واضحة أو PDF"}</span>
          <span class="field-error slot-error" hidden></span>
        </div>
        <div class="slot-actions">
          <label class="chip-btn slot-pick">${icon("upload", { size: 16 })}<span>${file ? "تغيير" : "رفع"}</span>
            <input type="file" class="sr-only" accept="${requirement.allowedMimeTypes?.length ? esc(requirement.allowedMimeTypes.join(",")) : ALLOWED_DOC_ACCEPT}" data-slot-input="${esc(slot.key)}" aria-label="${esc(slot.label)}">
          </label>
          ${file ? `<button type="button" class="chip-btn slot-remove" data-slot-remove="${esc(slot.key)}">${icon("close", { size: 14 })}<span>إزالة</span></button>` : ""}
        </div>
      </div>`;
  }

  function travelerCard(traveler, index, list) {
    const own = list.filter((slot) => slot.travelerIndex === index);
    const canRemove = index > 0 && state.values.travelers.length > 1;
    return `
      <fieldset class="traveler-card" data-traveler="${index}">
        <legend>${travelerWord} ${index + 1}</legend>
        ${canRemove ? `<button type="button" class="link-btn traveler-remove" data-remove-traveler="${index}">${icon("close", { size: 14 })} إزالة</button>` : ""}
        <label class="field">
          <span>الاسم كما في جواز السفر *</span>
          <input name="t_name_${index}" value="${esc(traveler.fullName || "")}" autocomplete="off">
        </label>
        ${own.map((slot) => slotRow(slot)).join("")}
      </fieldset>`;
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
        <div class="review-row"><span>${current.priceUnit === "PER_TRAVELER"
          ? `<bdi>${esc(summary.unitPriceText)}</bdi> × ${summary.units} ${needsGuarantor ? (summary.units === 1 ? "معتمر" : "معتمرين") : summary.units === 1 ? "مسافر" : "مسافرين"}`
          : "سعر ثابت للطلب"}</span><b id="fixedTotalAmount"><bdi>${esc(summary.totalText)}</bdi></b></div>
        ${summary.sdgAmountText ? `<p class="field-hint" id="fixedTotalSdg">ما يعادل <bdi>${esc(summary.sdgAmountText)}</bdi> بسعر الصرف المعتمد من الوكالة</p>`
          : summary.sdgText ? `<p class="field-hint" id="fixedTotalSdg">${esc(summary.sdgText)}</p>` : ""}
        <p class="field-hint">${esc(summary.payment)}</p>
        <label class="confirm-check"><input type="checkbox" id="confirmTotal"> <span>أؤكد طلبي بإجمالي <bdi>${esc(summary.totalText)}</bdi>.</span></label>
      </section>`;
  }

  function renderForm() {
    const v = state.values;
    const list = slots();
    const shared = list.filter((slot) => slot.travelerIndex === null);
    const fixed = Boolean(pricing());
    stepBody.innerHTML = `
      <section class="form-section" id="travelersSection">
        <h3>${needsGuarantor ? "المعتمرون وجوازاتهم" : "المسافرون"}</h3>
        <div id="travelersBox">${v.travelers.map((traveler, index) => travelerCard(traveler, index, list)).join("")}</div>
        ${v.travelers.length < maxTravelers ? `<button type="button" class="secondary add-traveler" id="addTravelerBtn">${icon("plus", { size: 18 })} أضف ${travelerWord === "المعتمر" ? "معتمرًا" : "مسافرًا"}</button>` : ""}
      </section>
      ${egyptMode === "AIR" ? `
        <section class="form-section" id="egyptRouteSection">
          <h3>خط السير</h3>
          <div class="field-row">
            <label class="field"><span>جهة القدوم *</span><input name="departureCity" maxlength="80" value="${esc(v.departureCity || "")}"></label>
            <label class="field"><span>مطار الوصول *</span><input name="arrivalAirport" maxlength="80" value="${esc(v.arrivalAirport || "")}"></label>
          </div>
          <p class="field-hint">عدّلهما إن كانت رحلتك من مكان آخر.</p>
        </section>` : egyptMode === "BORDER" ? `
        <section class="form-section" id="egyptRouteSection">
          <h3>خط السير</h3>
          <label class="field"><span>منفذ الدخول *</span><input name="entryPort" maxlength="80" value="${esc(v.entryPort || "")}" placeholder="اسم المنفذ البري"></label>
        </section>` : ""}
      ${needsGuarantor || shared.length ? `
        <section class="form-section" id="${needsGuarantor ? "umrahContactsSection" : "sharedDocsSection"}">
          <h3>${needsGuarantor ? "الضامن" : "مستندات الطلب"}</h3>
          ${shared.map((slot) => slotRow(slot)).join("")}
          ${needsGuarantor ? `<label class="field"><span>رقم هاتف الضامن *</span><input name="guarantorPhone" inputmode="tel" dir="ltr" value="${esc(v.guarantorPhone || "")}" autocomplete="off"></label>` : ""}
        </section>` : ""}
      <section class="form-section" id="contactSection">
        <h3>للتواصل معك</h3>
        <label class="field"><span>${needsGuarantor ? "اسم مقدم الطلب *" : "اسمك *"}</span><input name="name" value="${esc(v.name)}" autocomplete="name"></label>
        <label class="field"><span>رقم هاتفك (واتساب) *</span><input name="phone" inputmode="tel" dir="ltr" value="${esc(v.phone)}" autocomplete="tel"></label>
        <p class="field-hint">بهذا الرقم تتابع طلبك برمز تحقق عبر واتساب، دون حساب.</p>
      </section>
      ${answerRequirements().length ? `
        <section class="form-section" id="answersSection">
          <h3>معلومات يطلبها فريق الوكالة</h3>
          ${answerRequirements().map((requirement) => answerInput(requirement, v.answers[requirement.id])).join("")}
        </section>` : ""}
      ${fixed ? "" : `
        <section class="form-section">
          <label class="field"><span>ملاحظات (اختياري)</span><textarea name="notes" rows="3">${esc(v.notes)}</textarea></label>
          <p class="field-hint">السعر النهائي وتعليمات الدفع تصلك بعد مراجعة الوكالة.</p>
        </section>`}
      ${totalReviewHtml()}
      <div id="uploadProgressWrap" class="upload-progress-wrap" hidden>
        <div class="upload-progress-bar"><div id="uploadProgressFill" class="upload-progress-fill"></div></div>
        <span id="uploadProgressLabel">0%</span>
      </div>`;
    stepBody.dataset.visible = visibleSignature();
    renderActions();
  }

  function renderActions() {
    const current = pricing();
    const total = current ? fixedTotalSummary(current, state.values.travelers.length).totalText : "";
    stepActions.innerHTML = `<button type="button" class="primary" id="nextStepBtn" ${pricingBlocked ? "disabled" : ""}>${current ? `تأكيد الطلب بإجمالي <bdi>${esc(total)}</bdi>` : "إرسال الطلب للوكالة"}</button>`;
    stepActions.querySelector("#nextStepBtn").addEventListener("click", submit);
  }

  // One set of listeners for the whole form (it is re-drawn in place).
  stepBody.addEventListener("input", (event) => {
    if (submitting || event.target.matches?.("[data-slot-input]")) return;
    syncData();
  });
  stepBody.addEventListener("change", (event) => {
    if (submitting) return;
    const input = event.target;
    if (input.matches?.("[data-slot-input]")) {
      const slot = slots().find((candidate) => candidate.key === input.dataset.slotInput);
      const file = input.files?.[0];
      if (!slot || !file) return;
      const error = validateFile(file, slot.requirement);
      if (error) {
        const errorEl = input.closest(".slot")?.querySelector(".slot-error");
        if (errorEl) { errorEl.textContent = error; errorEl.hidden = false; }
        input.value = "";
        return;
      }
      syncData();
      state.files.set(slot.key, file);
      renderForm();
      return;
    }
    if (input.id === "confirmTotal") return;
    syncData();
    // An answer can reveal or hide another question (conditional requirements).
    if (visibleSignature() !== stepBody.dataset.visible) {
      const focused = document.activeElement?.getAttribute?.("name");
      renderForm();
      if (focused) stepBody.querySelector(`[name="${CSS.escape(focused)}"]`)?.focus();
    }
  });
  stepBody.addEventListener("click", (event) => {
    if (submitting) return;
    const removeFile = event.target.closest?.("[data-slot-remove]");
    if (removeFile) {
      syncData();
      state.files.delete(removeFile.dataset.slotRemove);
      renderForm();
      return;
    }
    if (event.target.closest?.("#addTravelerBtn")) {
      syncData();
      if (state.values.travelers.length >= maxTravelers) return;
      state.values.travelers = [...state.values.travelers, { fullName: "", passportNo: "", nationality: "" }];
      saveDraft();
      renderForm();
      stepBody.querySelector(`[name="t_name_${state.values.travelers.length - 1}"]`)?.focus();
      return;
    }
    const removeTraveler = event.target.closest?.("[data-remove-traveler]");
    if (removeTraveler) {
      const index = Number(removeTraveler.dataset.removeTraveler);
      syncData();
      const hasFiles = [...state.files.keys()].some((key) => key.endsWith(`::${index}`));
      if (hasFiles && !confirmDialog(`إزالة ${travelerWord} ${index + 1} ومستنداته؟`)) return;
      state.files = removeTravelerFiles(state.files, index);
      state.values.travelers = state.values.travelers.filter((_, position) => position !== index);
      saveDraft();
      renderForm();
    }
  });

  function validateAll() {
    syncData();
    return [
      ...Object.values(validateTravelers(state.values.travelers)),
      ...validateEgyptRoute(egyptMode, state.values),
      ...validateSlots(slots(), state.files).map((problem) => problem.message),
      ...(needsGuarantor ? validateUmrahContacts(state.values) : []),
      ...Object.values(validateContact({ name: state.values.name, phone: state.values.phone })),
      ...missingAnswers(requirements, state.values.answers).filter((m) => answerRequirements().some((r) => r.id === m.key)).map((m) => m.message),
    ];
  }

  async function submit() {
    if (submitting || pricingBlocked) return;
    const messages = validateAll();
    const fixed = pricing() ? fixedTotalSummary(pricing(), state.values.travelers.length) : null;
    if (fixed && !stepBody.querySelector("#confirmTotal")?.checked) messages.push("أكّد الإجمالي النهائي قبل إرسال الطلب.");
    showErrors(messages);
    if (messages.length) return;

    // An immutable snapshot of what is sent; the form is frozen meanwhile.
    const v = JSON.parse(JSON.stringify(state.values));
    const notes = String(v.notes || "").trim();
    submitting = true;
    clearTimeout(saveTimer);
    stepBody.setAttribute("inert", "");
    const parts = buildUploadParts(slots(), state.files);
    const submitBtn = stepActions.querySelector("#nextStepBtn");
    setLoading(submitBtn, true, "جارٍ الإرسال…");

    const travelers = v.travelers.map((traveler, index) => ({ fullName: traveler.fullName, passportNo: traveler.passportNo || "", nationality: traveler.nationality || "", isPrimary: index === 0 }));
    const payload = new FormData();
    payload.set("name", v.name);
    payload.set("phone", v.phone);
    if (v.email) payload.set("email", v.email);
    if (needsGuarantor) payload.set("guarantorPhone", v.guarantorPhone);
    if (egyptMode === "AIR") {
      payload.set("departureCity", v.departureCity);
      payload.set("arrivalAirport", v.arrivalAirport);
    } else if (egyptMode === "BORDER") {
      payload.set("entryPort", v.entryPort);
    }
    payload.set("service", item.name);
    if (item.id) payload.set(item.isVisaType ? "visaTypeId" : "serviceId", item.id);
    if (item.serviceId) payload.set("serviceId", item.serviceId);
    const message = notes || `طلب ${item.name}`;
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
      dropDraft();
      showSubmitted(outcome, { serviceName: item.name, phone: v.phone, travelerCount: travelers.length, payNow: Boolean(fixed && !pricing()?.paymentAfterDocumentReview) });
    } catch (error) {
      submitting = false;
      stepBody.removeAttribute("inert");
      setLoading(submitBtn, false);
      if (progressWrap) progressWrap.hidden = true;
      saveDraft();
      // The agency changed the price (or moved the service to quotation)
      // after this screen loaded: nothing was created. Show the current
      // terms and ask for a fresh confirmation.
      // Umrah packages and Egypt variants are booked only at a fixed price:
      // never fall back to a quoted request for them.
      if (error instanceof ApiError && error.code === "PRICING_MODE_CHANGED" && fixedOnly) {
        pricingBlocked = true;
        submitBtn.disabled = true;
        showErrors(["لم يعد السعر الثابت لهذا الخيار متاحًا، ولم يُرسل طلبك. ارجع واختر من جديد أو تواصل مع الوكالة."]);
        return;
      }
      if (error instanceof ApiError && (error.code === "PRICE_CHANGED" || error.code === "PRICING_MODE_CHANGED")) {
        pricingItem = error.code === "PRICE_CHANGED" ? withServerPrice(pricingItem, error.details) : { ...pricingItem, pricingMode: "QUOTE" };
        renderForm();
        showErrors([error.message]);
        return;
      }
      showErrors([submitFailureMessage(error)]);
      toast(submitFailureMessage(error), { tone: "error" });
    }
  }

  renderForm();
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
