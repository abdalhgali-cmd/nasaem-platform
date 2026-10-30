// Service-aware progress of a request, as computed by the server
// (backend request-progress.js): the same stages staff see. Nothing here
// infers a stage the server didn't send.
//
// Rendered as connected, tappable stage circles (done / current /
// upcoming). Selecting a circle opens that stage's real details (the
// server's status line plus the request's own data) and the action the
// customer can take there now — only actions the server lists in
// allowedActions. Accessible as a tab list: one tab stop, arrow keys move
// between stages (mirrored in RTL), Home/End, Enter/Space select.
// The HTML builders are pure and unit-tested without a DOM.

import { egyptJourney, isEgyptOverview } from "./egypt-journey.js";

const STATE_CLASS = { done: "done", current: "current", upcoming: "upcoming" };
const STATE_AR = { done: "مكتملة", current: "المرحلة الحالية", upcoming: "لم تبدأ بعد" };

export function progressSteps(progress) {
  if (!progress || !Array.isArray(progress.steps)) return [];
  return progress.steps
    .filter((step) => step && step.label)
    .map((step) => ({
      key: step.key,
      label: step.label,
      state: STATE_CLASS[step.state] || "upcoming",
      status: typeof step.status === "string" ? step.status : "",
      ...(step.key === "EXECUTION" ? { started: Boolean(step.started) } : {}),
    }));
}

// The stage shown when the screen opens: the current one, else the last
// completed one (a closed request has no current stage).
export function defaultStepKey(steps) {
  const current = steps.find((step) => step.state === "current");
  if (current) return current.key;
  const done = steps.filter((step) => step.state === "done");
  return (done[done.length - 1] || steps[0])?.key || null;
}

// "2 من 6: مراجعة المستندات — المرحلة الحالية"
export function stepAccessibleName(step, index, total) {
  const state = step.key === "EXECUTION" && step.state === "current" && step.started ? "قيد التنفيذ، لم تكتمل بعد" : STATE_AR[step.state];
  return `${index + 1} من ${total}: ${step.label} — ${state}`;
}

const allowed = (request, action) =>
  request?.status !== "CLOSED" && Array.isArray(request?.allowedActions) && request.allowedActions.includes(action);

// The action a stage offers now. `open` clicks the real control (opens the
// upload/plan form); `show` moves to it (the customer decides there, e.g.
// approving a price they can read).
export function stepAction(step, request) {
  const checklistTodo = (request?.checklist || []).some((item) => item.required && (item.state === "MISSING" || item.state === "REJECTED"));
  switch (step.key) {
    case "DOCUMENTS":
      if (allowed(request, "UPLOAD_DOCUMENT") && checklistTodo) return { label: "رفع المستندات المطلوبة", target: "#documentsBlock", mode: "show" };
      return (request?.checklist?.length || request?.documents?.length) ? { label: "عرض المستندات", target: "#documentsBlock", mode: "show" } : null;
    case "QUOTE":
      if (allowed(request, "APPROVE_QUOTE")) return { label: "مراجعة السعر والموافقة عليه", target: "#quoteBlock", mode: "show" };
      if (allowed(request, "SELECT_OFFER")) return { label: "اختيار أحد العروض", target: "#offersBlock", mode: "show" };
      return null;
    case "PAYMENT":
    case "PAYMENT_REVIEW":
      if (allowed(request, "UPLOAD_RECEIPT")) return { label: request?.paymentRejection ? "رفع إيصال بديل" : "رفع إثبات الدفع", target: "#uploadReceiptBtn", mode: "open" };
      return null;
    case "DELIVERY":
      return request?.deliverables?.length ? { label: "تحميل الملفات النهائية", target: "#deliverablesBlock", mode: "show" } : null;
    case "TRAVEL_PLAN":
      return allowed(request, "SAVE_TRAVEL_PLAN") ? { label: "استكمال بيانات السفر والتعميم", target: "#egyptTravelBtn", mode: "open" } : null;
    default:
      return null;
  }
}

const NUMBER = new Intl.NumberFormat("ar", { maximumFractionDigits: 2 });
const amountText = (amount, currency) => `${NUMBER.format(Number(amount))} ${currency || ""}`.trim();

// Facts from the request itself for a stage (beyond the server's line).
function stepFacts(step, request, progress) {
  const facts = [];
  if (step.key === "RECEIVED") {
    if (request?.id) facts.push(["الرقم المرجعي", request.id, "ltr"]);
    if (progress?.pricingMode === "FIXED" && progress.pricing) facts.push(["الإجمالي المؤكد", amountText(progress.pricing.total, progress.pricing.currency)]);
  }
  if (step.key === "DOCUMENTS" && Array.isArray(request?.checklist)) {
    const required = request.checklist.filter((item) => item.required);
    const accepted = required.filter((item) => item.state === "ACCEPTED").length;
    if (required.length) facts.push(["المعتمد", `${NUMBER.format(accepted)} من ${NUMBER.format(required.length)}`]);
  }
  if (step.key === "QUOTE" && request?.invoice) facts.push(["السعر", amountText(request.invoice.amount, request.invoice.currency)]);
  if ((step.key === "PAYMENT" || step.key === "PAYMENT_REVIEW") && request?.invoice && progress?.pricingMode === "FIXED") {
    facts.push(["المبلغ", amountText(request.invoice.amount, request.invoice.currency)]);
  }
  if (step.key === "PAYMENT_REVIEW" && request?.paymentRejection?.reason) facts.push(["سبب رفض الإيصال", request.paymentRejection.reason]);
  if (step.key === "DELIVERY" && request?.deliverables?.length) facts.push(["الملفات المنشورة", NUMBER.format(request.deliverables.length)]);
  return facts;
}

export function stepPanelHtml(step, request, progress, esc) {
  if (!step) return "";
  const action = stepAction(step, request);
  const facts = stepFacts(step, request, progress);
  return `
    <h5 class="progress-panel-title">${esc(step.label)} <small class="progress-panel-state progress-panel-state-${esc(step.state)}">${esc(step.key === "EXECUTION" && step.state === "current" && step.started ? "قيد التنفيذ — لم تكتمل بعد" : STATE_AR[step.state])}</small></h5>
    ${step.status ? `<p class="progress-panel-status">${esc(step.status)}</p>` : ""}
    ${facts.length ? `<dl class="progress-panel-facts">${facts.map(([term, value, dir]) => `<div><dt>${esc(term)}</dt><dd${dir ? ` dir="${dir}"` : ""}>${esc(value)}</dd></div>`).join("")}</dl>` : ""}
    ${action ? `<button type="button" class="primary progress-panel-action" data-progress-target="${esc(action.target)}" data-progress-mode="${esc(action.mode)}">${esc(action.label)}</button>` : ""}`;
}

export function progressBlockHtml(progress, esc, request = null, selectedKey = null) {
  const steps = progressSteps(progress);
  if (!steps.length) return "";
  const selected = steps.some((step) => step.key === selectedKey) ? selectedKey : defaultStepKey(steps);
  const doneCount = steps.filter((step) => step.state === "done").length;
  const nodes = steps
    .map((step, index) => {
      const isSelected = step.key === selected;
      const mark = step.state === "done" ? "✓" : String(index + 1);
      return `
        <li class="progress-node progress-node-${step.state}${step.key === "EXECUTION" && step.started && step.state === "current" ? " progress-node-started" : ""}" role="presentation">
          <button type="button" role="tab" class="progress-circle" id="progressTab-${esc(step.key)}" data-step="${esc(step.key)}" data-state="${step.state}"
            aria-selected="${isSelected}" aria-controls="progressStepPanel" tabindex="${isSelected ? "0" : "-1"}"${step.state === "current" ? ' aria-current="step"' : ""}
            aria-label="${esc(stepAccessibleName(step, index, steps.length))}"><span class="progress-circle-mark" aria-hidden="true">${mark}</span></button>
          <span class="progress-node-label" aria-hidden="true">${esc(step.label)}</span>
        </li>`;
    })
    .join("");
  const selectedStep = steps.find((step) => step.key === selected);
  return `
    <div class="detail-block progress-block" id="requestProgress" data-pricing-mode="${esc(progress.pricingMode || "QUOTE")}">
      <h4>مراحل الطلب${progress.serviceKindLabel ? ` — ${esc(progress.serviceKindLabel)}` : ""}</h4>
      <p class="progress-label" role="status">${esc(progress.label || "")}</p>
      <p class="sr-only">اكتملت ${doneCount} من ${steps.length} مراحل. اختر مرحلة لعرض تفاصيلها.</p>
      <div class="progress-track-scroll">
        <ol class="progress-track" role="tablist" aria-label="مراحل الطلب">${nodes}</ol>
      </div>
      <div class="progress-panel" id="progressStepPanel" role="tabpanel" aria-labelledby="progressTab-${esc(selected)}" tabindex="-1">${stepPanelHtml(selectedStep, request, progress, esc)}</div>
    </div>`;
}

// ---- The customer's view: the server's stages grouped into the moments the
// customer recognises (request → payment → issuing → ready). Agency-internal
// work (document review, receipt review) is a sub-status of those moments,
// never a step of its own. Nothing is inferred: every state and line comes
// from the server's steps, and the full stage list stays one tap away.
const CUSTOMER_GROUPS = Object.freeze([
  { key: "REQUEST", label: "تم استلام الطلب", members: ["RECEIVED", "DOCUMENTS"] },
  { key: "QUOTE", label: "عرض السعر", members: ["QUOTE"] },
  { key: "PAY", label: "الدفع", members: ["PAYMENT", "PAYMENT_REVIEW"] },
  { key: "EXECUTION", label: null, members: ["EXECUTION"] },
  { key: "DONE", label: null, members: ["DELIVERY", "TRAVEL_PLAN"] },
]);
const GROUP_DEFAULT_DETAIL = {
  DOCUMENTS: "نراجع مستنداتك.",
  PAYMENT: "بانتظار التحويل ورفع إشعار التحويل.",
  PAYMENT_REVIEW: "يراجع موظف الوكالة التحويل ويؤكده.",
};
// What the customer must do, most urgent first. «عرض المستندات» is not a
// task, so it never takes this place.
const ACTION_PRIORITY = ["DOCUMENTS", "PAYMENT", "PAYMENT_REVIEW", "QUOTE", "TRAVEL_PLAN", "DELIVERY"];

export function journeyCompletion(stages = []) {
  const total = stages.length;
  const done = stages.filter((stage) => stage?.state === "done").length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function customerJourney(progress, request = null) {
  const steps = progressSteps(progress);
  if (!steps.length) return null;
  // Egypt security approval: its own six customer steps (server timeline).
  if (isEgyptOverview(request)) {
    const byKeyEgypt = new Map(steps.map((step) => [step.key, step]));
    let customerAction = null;
    for (const key of ["DOCUMENTS", "PAYMENT", "PAYMENT_REVIEW"]) {
      const step = byKeyEgypt.get(key);
      const candidate = step ? stepAction(step, request) : null;
      if (candidate && candidate.label !== "عرض المستندات") { customerAction = candidate; break; }
    }
    const journey = egyptJourney(request, { fallbackHeadline: progress.label || "", customerAction });
    return journey ? { ...journey, completion: journeyCompletion(journey.stages) } : null;
  }
  const byKey = new Map(steps.map((step) => [step.key, step]));
  // A closed or finished request has no current stage on the server: then
  // nothing is shown as in progress.
  const open = steps.some((step) => step.state === "current");
  const stages = [];
  for (const group of CUSTOMER_GROUPS) {
    const members = group.members.map((key) => byKey.get(key)).filter(Boolean);
    if (!members.length) continue;
    // In progress: the server's current step is here, or part of the moment
    // is already done (e.g. the receipt is uploaded while the documents are
    // still being reviewed). Its line is that of its first unfinished step.
    const current = members.find((step) => step.state === "current");
    const allDone = members.every((step) => step.state === "done");
    const partly = open && !allDone && members.some((step) => step.state === "done");
    const state = allDone ? "done" : current || partly ? "current" : "upcoming";
    const label = group.label || members[0].label;
    const pending = current || members.find((step) => step.state !== "done");
    const detail = state === "current" && pending ? pending.status || GROUP_DEFAULT_DETAIL[pending.key] || "" : "";
    stages.push({ key: group.key, label, state, detail });
  }
  const now = stages.find((stage) => stage.state === "current");
  // The server's own one-line state of the whole request (e.g. «جارٍ إصدار
  // التأشيرة», «بانتظار مراجعة إثبات التحويل»), else the current moment.
  const headline = progress.label || now?.label || "";
  let action = null;
  for (const key of ACTION_PRIORITY) {
    const step = byKey.get(key);
    const candidate = step ? stepAction(step, request) : null;
    if (candidate && candidate.label !== "عرض المستندات") { action = candidate; break; }
  }
  return { stages, headline, action, completion: journeyCompletion(stages) };
}

export function journeyBlockHtml(progress, esc, request = null) {
  const journey = customerJourney(progress, request);
  if (!journey) return "";
  return `
    <div class="detail-block journey-block" id="requestJourney">
      <div class="journey-summary">
        <p class="journey-headline" role="status">${esc(journey.headline)}</p>
        ${journey.completion.total ? `<span class="journey-count">اكتملت ${journey.completion.done} من ${journey.completion.total}</span>` : ""}
      </div>
      ${journey.completion.total ? `<div class="journey-meter" role="progressbar" aria-label="تقدم الطلب" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${journey.completion.percent}"><span style="--journey-progress:${journey.completion.percent}%"></span></div>` : ""}
      ${journey.action ? `<button type="button" class="primary journey-action" id="journeyActionBtn" data-progress-target="${esc(journey.action.target)}" data-progress-mode="${esc(journey.action.mode)}">${esc(journey.action.label)}</button>` : ""}
      <ol class="journey-stages" aria-label="مراحل طلبك">
        ${journey.stages.map((stage) => `
          <li class="journey-stage journey-stage-${stage.state}"${stage.state === "current" ? ' aria-current="step"' : ""}>
            <span class="journey-dot" aria-hidden="true">${stage.state === "done" ? "✓" : ""}</span>
            <span class="journey-text"><b>${esc(stage.label)}</b>${stage.state === "current" && stage.detail && stage.detail !== journey.headline ? `<small>${esc(stage.detail)}</small>` : ""}<span class="sr-only"> — ${stage.state === "done" ? "مكتملة" : stage.state === "current" ? "الآن" : "لاحقًا"}</span></span>
          </li>`).join("")}
      </ol>
      <details class="journey-details">
        <summary>تفاصيل كل المراحل</summary>
        ${progressBlockHtml(progress, esc, request)}
      </details>
    </div>`;
}

// Runs a stage action button: `open` clicks the real control, `show` moves to it.
export function runProgressAction(root, button) {
  const target = root.querySelector(button.dataset.progressTarget);
  if (!target) return;
  if (button.dataset.progressMode === "open" && typeof target.click === "function") {
    target.click();
    return;
  }
  target.scrollIntoView?.({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  if (!target.hasAttribute("tabindex") && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Wires selection, keyboard and the panel actions inside `root` (the
// request detail screen). `rerender(key)` re-renders the panel for a key.
export function bindProgressTrack(root, { request, progress, esc }) {
  root.querySelector("#journeyActionBtn")?.addEventListener("click", (event) => runProgressAction(root, event.currentTarget));
  const block = root.querySelector("#requestProgress");
  if (!block) return;
  const tabs = () => [...block.querySelectorAll('[role="tab"]')];
  const panel = block.querySelector("#progressStepPanel");
  const steps = progressSteps(progress);

  function select(key, { focus = true } = {}) {
    for (const tab of tabs()) {
      const on = tab.dataset.step === key;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) {
        tab.focus();
        tab.scrollIntoView?.({ block: "nearest", inline: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    }
    panel.setAttribute("aria-labelledby", `progressTab-${key}`);
    panel.innerHTML = stepPanelHtml(steps.find((step) => step.key === key), request, progress, esc);
  }

  block.addEventListener("click", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab && block.contains(tab)) select(tab.dataset.step);
    const action = event.target.closest("[data-progress-target]");
    if (action && panel.contains(action)) runProgressAction(root, action);
  });

  block.addEventListener("keydown", (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (!tab) return;
    const list = tabs();
    const index = list.indexOf(tab);
    const rtl = getComputedStyle(block).direction === "rtl";
    let next = null;
    if (event.key === "ArrowLeft") next = rtl ? index + 1 : index - 1;
    else if (event.key === "ArrowRight") next = rtl ? index - 1 : index + 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    if (next === null) return;
    event.preventDefault();
    const bounded = Math.max(0, Math.min(list.length - 1, next));
    select(list[bounded].dataset.step);
  });
}
