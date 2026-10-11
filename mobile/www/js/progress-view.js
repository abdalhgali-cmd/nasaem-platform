// Service-aware progress of a request, as computed by the server
// (backend request-progress.js): the same stages staff see. Pure, so it is
// tested without a DOM. Nothing here infers a stage the server didn't send.

const STATE_CLASS = { done: "done", current: "current", upcoming: "upcoming" };

export function progressSteps(progress) {
  if (!progress || !Array.isArray(progress.steps)) return [];
  return progress.steps
    .filter((step) => step && step.label)
    .map((step) => ({ key: step.key, label: step.label, state: STATE_CLASS[step.state] || "upcoming" }));
}

export function progressBlockHtml(progress, esc) {
  const steps = progressSteps(progress);
  if (!steps.length) return "";
  const rows = steps
    .map((step) => `<li class="progress-step progress-step-${step.state}"${step.state === "current" ? ' aria-current="step"' : ""}><span class="progress-dot" aria-hidden="true"></span><span>${esc(step.label)}</span></li>`)
    .join("");
  return `
    <div class="detail-block progress-block" id="requestProgress">
      <h4>مراحل الطلب${progress.serviceKindLabel ? ` — ${esc(progress.serviceKindLabel)}` : ""}</h4>
      <p class="progress-label" role="status">${esc(progress.label || "")}</p>
      <ol class="progress-steps">${rows}</ol>
    </div>`;
}
