import { api } from "../api.js";
import { esc, toast, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import { renderIntakeScreen } from "./intake.js";

// Ferries: the customer describes the sea trip (route, direction, dates,
// preferred operator); the traveler details and documents follow in the shared
// request form. Routes and operators come from the agency's schedules; when
// none are published the customer types the ports, nothing is made up.

const TRIP_TYPES = { ONE_WAY: "ذهاب فقط", ROUND_TRIP: "ذهاب وعودة" };

export async function renderFerriesScreen({ bodyEl, params }) {
  const { item } = params;
  let tripType = "ONE_WAY";
  let routes = [];
  let carriers = [];

  try {
    const res = await api("/ferries/public");
    const operators = res.data?.operators || [];
    const schedules = res.data?.schedules || [];
    routes = [...new Set(schedules.map((s) => `${s.origin} → ${s.destination}`))];
    carriers = operators.map((operator) => operator.name).filter(Boolean);
  } catch {
    // Without published schedules the form asks for the ports directly.
  }

  const today = new Date().toISOString().slice(0, 10);
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("ferry", { size: 36 })}</div>
      <h2>حجوزات البواخر</h2>
      <p>أرسل تفاصيل رحلتك البحرية، وسيتحقق فريق نسائم الحرمين من التوفر والسعر قبل أي دفع.</p>
    </div>
    <form id="ferryForm" class="form" novalidate>
      <div class="segmented" id="ferryTripSwitch" role="group" aria-label="اتجاه الرحلة">
        ${Object.entries(TRIP_TYPES).map(([key, label]) => `<button type="button" class="segmented-btn ${key === tripType ? "active" : ""}" data-trip="${key}">${label}</button>`).join("")}
      </div>
      ${routes.length
        ? `<label class="field"><span>المسار *</span><select name="route"><option value="">اختر المسار</option>${routes.map((route) => `<option value="${esc(route)}">${esc(route)}</option>`).join("")}</select></label>`
        : `<div class="field-row">
             <label class="field"><span>من (ميناء المغادرة) *</span><input name="origin" autocomplete="off"></label>
             <label class="field"><span>إلى (ميناء الوصول) *</span><input name="destination" autocomplete="off"></label>
           </div>`}
      <div class="field-row">
        <label class="field"><span>تاريخ الذهاب *</span><input name="travelDate" type="date" min="${today}"></label>
        <label class="field" id="ferryReturnField" hidden><span>تاريخ العودة *</span><input name="returnDate" type="date" min="${today}"></label>
      </div>
      ${carriers.length ? `<label class="field"><span>الناقل المفضل (اختياري)</span><select name="carrier"><option value="">لا يهم</option>${carriers.map((carrier) => `<option value="${esc(carrier)}">${esc(carrier)}</option>`).join("")}</select></label>` : ""}
      <p class="step-errors" id="ferryErrors" role="alert" hidden></p>
      <button type="submit" class="primary" id="ferrySubmitBtn">متابعة بيانات المسافرين</button>
    </form>
    <div id="ferryIntakeMount"></div>
  `;

  const form = bodyEl.querySelector("#ferryForm");
  const errorsEl = bodyEl.querySelector("#ferryErrors");

  bodyEl.querySelector("#ferryTripSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-trip]");
    if (!button) return;
    tripType = button.dataset.trip;
    bodyEl.querySelectorAll("#ferryTripSwitch .segmented-btn").forEach((b) => b.classList.toggle("active", b === button));
    bodyEl.querySelector("#ferryReturnField").hidden = tripType !== "ROUND_TRIP";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const route = routes.length ? data.route : `${String(data.origin || "").trim()} → ${String(data.destination || "").trim()}`;
    const problems = [];
    if (routes.length ? !data.route : !String(data.origin || "").trim() || !String(data.destination || "").trim()) problems.push("حدد مسار الرحلة.");
    if (!data.travelDate) problems.push("اختر تاريخ الذهاب.");
    if (tripType === "ROUND_TRIP") {
      if (!data.returnDate) problems.push("اختر تاريخ العودة.");
      else if (data.travelDate && data.returnDate < data.travelDate) problems.push("تاريخ العودة قبل تاريخ الذهاب.");
    }
    errorsEl.hidden = !problems.length;
    errorsEl.innerHTML = problems.map((message) => `<span>${esc(message)}</span>`).join("");
    if (problems.length) return;

    const carrier = data.carrier || "";
    const summary =
      `${TRIP_TYPES[tripType]}: ${route}\nتاريخ الذهاب: ${data.travelDate}` +
      `${tripType === "ROUND_TRIP" ? `\nتاريخ العودة: ${data.returnDate}` : ""}` +
      `${carrier ? `\nالناقل المفضل: ${carrier}` : ""}`;
    const selection = {
      summary,
      details: { type: "FERRY", tripType, route, travelDate: data.travelDate, returnDate: tripType === "ROUND_TRIP" ? data.returnDate : null, carrier: carrier || null },
    };
    const submitBtn = bodyEl.querySelector("#ferrySubmitBtn");
    setLoading(submitBtn, false);
    const mount = bodyEl.querySelector("#ferryIntakeMount");
    mount.scrollIntoView({ behavior: "smooth" });
    renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection }).catch((error) => toast(error.message, { tone: "error" }));
  });
}
