// Egypt security approval on the request screen: the six-step timeline,
// the downloadable files (receipt, approval, circular, tickets) and the
// «تجهيز السفر والتعميم» section. Everything comes from the server's
// `egypt` overview (backend egypt-approval-rules.js egyptOverview); nothing
// is inferred here. Pure HTML builders, unit-tested without a DOM.

const STAGE_DETAIL = {
  PAYMENT_CONFIRMED: "نراجع تحويلك ونؤكده.",
  APPROVAL_IN_PROGRESS: "تعمل الوكالة على إصدار الموافقة.",
  CIRCULAR_ISSUED: "تجهّز الوكالة التعميم.",
};

export function isEgyptOverview(request) {
  return Boolean(request?.egypt && Array.isArray(request.egypt.timeline));
}

// What the customer must provide for the travel preparation (agency work is
// never listed as the customer's).
export function customerTodo(egypt) {
  if (!egypt?.approval?.issued || egypt.travel?.preparationComplete) return [];
  return (egypt.travel?.missing || []).map((item) => item.message);
}

function headlineOf(egypt, fallback, closed) {
  // A closed request says how it ended (the server's line).
  if (closed) return fallback;
  if (egypt.circular?.status === "ISSUED") return "تم إصدار التعميم";
  if (egypt.approval?.issued) return "تم إصدار الموافقة الأمنية";
  return fallback;
}

// Same shape as progress-view.js customerJourney: { stages, headline, action }.
// `customerAction` is the generic customer action (documents, payment), which
// stays first; then the travel preparation when the customer has something to add.
export function egyptJourney(request, { fallbackHeadline = "", customerAction = null } = {}) {
  const egypt = request.egypt;
  const todo = customerTodo(egypt);
  const stages = egypt.timeline.map((step) => {
    let detail = "";
    if (step.state === "current") {
      if (step.key === "TRAVEL_PREPARATION") detail = todo.length ? `مطلوب منك: ${todo.join(" ")}` : "";
      else if (step.key === "CIRCULAR_ISSUED") detail = egypt.circular.status === "PROCESSING" ? STAGE_DETAIL.CIRCULAR_ISSUED : "يُجهَّز التعميم بعد اكتمال بيانات السفر.";
      else detail = STAGE_DETAIL[step.key] || "";
    }
    return { key: step.key, label: step.label, state: step.state, detail };
  });
  const prepAction = todo.length && egypt.travel?.customerCanEdit
    ? { label: "استكمال تجهيز السفر", target: "#egyptPrep", mode: "show" }
    : null;
  return { stages, headline: headlineOf(egypt, fallbackHeadline, request.status === "CLOSED"), action: customerAction || prepAction };
}

// Every file the customer can download, each on its own.
export function egyptFiles(request) {
  const egypt = request.egypt;
  const files = [];
  if (egypt.receipt?.available) files.push({ kind: "RECEIPT", label: "تحميل إيصال السداد", receiptNo: egypt.receipt.receiptNo });
  for (const file of egypt.approval?.files || []) files.push({ kind: "APPROVAL", label: "تحميل الموافقة", deliverableId: file.id, requestId: request.id });
  for (const file of egypt.circular?.files || []) files.push({ kind: "CIRCULAR", label: "تحميل التعميم PDF", deliverableId: file.id, requestId: request.id });
  for (const ticket of egypt.tickets || []) {
    if (ticket.source === "CUSTOMER") continue;
    files.push({ kind: "TICKET", label: "تحميل التذكرة", deliverableId: ticket.deliverableId, requestId: ticket.requestId || request.id });
  }
  return files;
}

export function egyptFilesHtml(request, esc, icon) {
  const files = egyptFiles(request);
  const egypt = request.egypt;
  const notes = [];
  if (egypt.approval?.issued) notes.push(`<p class="egypt-status egypt-status-done" id="egyptApprovalIssued">${icon("check-circle", { size: 16 })} تم إصدار الموافقة الأمنية${egypt.approval.issuedOn ? ` <small dir="ltr">${esc(egypt.approval.issuedOn)}</small>` : ""}</p>`);
  if (egypt.circular?.status === "ISSUED") notes.push(`<p class="egypt-status egypt-status-done" id="egyptCircularIssued">${icon("check-circle", { size: 16 })} تم إصدار التعميم</p>`);
  if (egypt.receipt?.status && !egypt.receipt.available) notes.push('<p class="field-hint">إيصال السداد قيد الإنشاء.</p>');
  if (!files.length && !notes.length) return "";
  return `
    <div class="detail-block egypt-files" id="egyptFiles">
      <h4>ملفاتك</h4>
      ${notes.join("")}
      ${files.map((file) => `<button type="button" class="secondary egypt-file-btn" data-egypt-file="${esc(file.kind)}"${file.deliverableId ? ` data-deliverable="${esc(file.deliverableId)}" data-request="${esc(file.requestId)}"` : ""}>${icon("download", { size: 16 })} ${esc(file.label)}</button>`).join("")}
    </div>`;
}

const FLIGHT_AR = { REQUEST: "طلبت حجز التذكرة عبر نسائم — ستتواصل معك الوكالة بالسعر.", BOOKED: "ذكرت أنك حجزت التذكرة بنفسك.", LATER: "ستقرر لاحقًا." };

// «تجهيز السفر والتعميم»: shown once the approval is issued. What is still
// missing (from the customer), the travel date, the flight question.
export function egyptPrepHtml(request, esc, { canEditPlan = false, canChooseFlight = false } = {}) {
  const egypt = request.egypt;
  if (!egypt.approval?.issued) return "";
  const travel = egypt.travel || {};
  const todo = customerTodo(egypt);
  const air = egypt.entryMode !== "BORDER";
  const date = travel.travelDate
    ? `<p>${air ? "تاريخ السفر" : "تاريخ الوصول إلى المنفذ"}: <b dir="ltr">${esc(travel.travelDate)}</b></p>`
    : `<p class="field-hint">${air ? "تاريخ السفر" : "تاريخ الوصول إلى المنفذ"} لم يُحدَّد بعد.</p>`;
  return `
    <div class="detail-block egypt-prep" id="egyptPrep">
      <h4>تجهيز السفر والتعميم</h4>
      <p class="field-hint">الموافقة الأمنية صادرة؛ هذه الخطوة لتجهيز التعميم قبل سفرك.</p>
      ${date}
      ${!air && egypt.route?.entryPort ? `<p>منفذ الدخول: <b>${esc(egypt.route.entryPort)}</b></p>` : ""}
      ${todo.length
        ? `<div class="egypt-todo" role="status"><b>مطلوب منك</b><ul>${todo.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>`
        : `<p class="egypt-status egypt-status-done">بيانات السفر مكتملة؛ تجهّز الوكالة التعميم.</p>`}
      ${canEditPlan ? `<button type="button" class="primary" id="egyptTravelBtn">${travel.travelDate ? "تعديل بيانات السفر" : "إضافة بيانات السفر"}</button>` : !travel.customerCanEdit && travel.travelDate ? '<p class="field-hint">صدر التعميم بهذه البيانات؛ لتعديلها تواصل مع الوكالة.</p>' : ""}
      ${air ? `
        <div class="egypt-flight" id="egyptFlight">
          <p><b>هل ترغب في حجز تذكرة الطيران عبر نسائم الحرمين؟</b></p>
          ${egypt.flight?.choice ? `<p class="field-hint" id="egyptFlightChoice">${esc(FLIGHT_AR[egypt.flight.choice] || "")}</p>` : ""}
          ${canChooseFlight ? `
            <div class="chip-row">
              <button type="button" class="chip-btn" data-flight-choice="REQUEST">نعم، احجزوا لي</button>
              <button type="button" class="chip-btn" data-flight-choice="BOOKED">حجزت بنفسي</button>
              <button type="button" class="chip-btn" data-flight-choice="LATER">لاحقًا</button>
            </div>` : ""}
        </div>` : ""}
    </div>`;
}
