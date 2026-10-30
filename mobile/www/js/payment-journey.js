function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function paymentJourneyHtml(summary = {}) {
  const confirmed = summary.paymentStatus === "CONFIRMED";
  const underReview = summary.paymentStatus === "UNDER_REVIEW";
  const steps = [
    { label: "بيانات الطلب", state: "done" },
    { label: "إشعار التحويل", state: underReview || confirmed ? "done" : "current" },
    { label: "تأكيد الدفع", state: confirmed ? "done" : underReview ? "current" : "upcoming" },
    { label: "بدء التنفيذ", state: confirmed ? "current" : "upcoming" },
  ];
  return `<ol class="payment-journey" aria-label="مراحل الطلب والدفع">
    ${steps.map((step, index) => `<li class="payment-journey-step is-${step.state}" aria-current="${step.state === "current" ? "step" : "false"}">
      <span class="payment-journey-dot" aria-hidden="true">${step.state === "done" ? "✓" : index + 1}</span>
      <span>${escapeHtml(step.label)}</span>
    </li>`).join("")}
  </ol>`;
}
