import { api } from "../api.js";
import { esc, money, toast, setLoading, emptyState, errorState } from "../ui.js";
import { icon } from "../icons.js";
import { renderIntakeScreen } from "./intake.js";

export async function renderFlightsScreen({ bodyEl, params }) {
  const { item } = params;
  const today = new Date().toISOString().slice(0, 10);
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("flight", { size: 36 })}</div>
      <h2>تذاكر الطيران</h2>
      <p>ابحث عن رحلتك، ثم أرسل طلب الحجز وسيتولى فريقنا تأكيد السعر والتوفر.</p>
    </div>
    <form id="flightSearchForm" class="form">
      <div class="field-row">
        <label class="field"><span>من (رمز المطار) *</span><input name="from" placeholder="PZU" maxlength="4" required style="text-transform:uppercase"></label>
        <label class="field"><span>إلى (رمز المطار) *</span><input name="to" placeholder="JED" maxlength="4" required style="text-transform:uppercase"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>تاريخ السفر *</span><input name="date" type="date" min="${today}" required></label>
        <label class="field"><span>عدد المسافرين</span><input name="travelers" type="number" min="1" max="9" value="1"></label>
      </div>
      <button type="submit" class="primary" id="flightSearchBtn">بحث عن الرحلات</button>
    </form>
    <div id="flightResults"></div>
  `;

  const form = bodyEl.querySelector("#flightSearchForm");
  const resultsEl = bodyEl.querySelector("#flightResults");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#flightSearchBtn");
    setLoading(submitBtn, true, "جارٍ البحث…");
    resultsEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 24 })}<p>جارٍ البحث عن الرحلات المتاحة…</p></div>`;
    try {
      const query = new URLSearchParams({ from: data.from.toUpperCase(), to: data.to.toUpperCase(), date: data.date, travelers: data.travelers || "1" });
      const res = await api(`/flights/search?${query.toString()}`);
      setLoading(submitBtn, false);
      const flights = (res.legs || []).flatMap((leg) => [...(leg.manual || []), ...(leg.trip || [])]);
      if (!flights.length) {
        resultsEl.innerHTML = `
          ${emptyState({ icon: "flight", title: "لا توجد رحلة مطابقة حالياً", hint: "يمكنك إرسال طلب حجز وسيتحقق فريقنا من البدائل المتاحة." })}
          <button class="primary" id="manualRequestBtn">إرسال طلب حجز</button>`;
        resultsEl.querySelector("#manualRequestBtn").addEventListener("click", () => openIntake(bodyEl, item));
        return;
      }
      resultsEl.innerHTML = flights.map((flight, index) => `
        <div class="travel-card">
          <strong>${esc(flight.airline || flight.carrier || "رحلة")}</strong>
          <span>${esc(flight.originCode || flight.from || data.from)} ← ${esc(flight.destinationCode || flight.to || data.to)}</span>
          <small>${esc(flight.departureAt || flight.departureTime || data.date)}</small>
          ${flight.price ? `<b>${money(flight.price, flight.currency || res.currency)}</b>` : ""}
          <button class="secondary book-flight-btn" data-index="${index}">طلب هذا الحجز</button>
        </div>`).join("");
      resultsEl.querySelectorAll(".book-flight-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const flight = flights[Number(btn.dataset.index)];
          openIntake(bodyEl, item, flightSelection(flight, data, res.currency));
        });
      });
    } catch (error) {
      setLoading(submitBtn, false);
      resultsEl.innerHTML = errorState(error.message);
      toast(error.message, { tone: "error" });
    }
  });
}

// The flight the customer picked travels with the request (shown on the
// form, appended to the message, stored in intakeData.selection) so the
// agency sees what was chosen. Prices from the search are an indication
// only; the agency confirms the price.
function flightSelection(flight, search, currency) {
  if (!flight) return null;
  const from = flight.originCode || flight.from || search.from.toUpperCase();
  const to = flight.destinationCode || flight.to || search.to.toUpperCase();
  const when = flight.departureAt || flight.departureTime || search.date;
  const carrier = flight.airline || flight.carrier || "";
  const price = flight.price ? `${flight.price} ${flight.currency || currency || ""}`.trim() : "";
  const summary = `الرحلة المختارة: ${carrier ? `${carrier} — ` : ""}${from} ← ${to}، ${when}${price ? `، السعر المعروض عند البحث: ${price} (يؤكده فريقنا)` : ""}، عدد المسافرين: ${search.travelers || 1}`;
  return {
    summary,
    details: { type: "FLIGHT", from, to, departure: when, carrier, flightNumber: flight.flightNumber || flight.number || null, quotedPrice: flight.price ?? null, currency: flight.currency || currency || null, travelers: Number(search.travelers) || 1, source: flight.source || null, flightId: flight.id ?? null },
  };
}

function openIntake(bodyEl, item, selection = null) {
  // One form at a time: picking another flight replaces it.
  bodyEl.querySelector("#flightIntakeMount")?.remove();
  const mount = document.createElement("div");
  mount.id = "flightIntakeMount";
  bodyEl.appendChild(mount);
  mount.scrollIntoView({ behavior: "smooth" });
  renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection });
}
