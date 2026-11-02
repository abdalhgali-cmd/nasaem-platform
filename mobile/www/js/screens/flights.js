import { api } from "../api.js";
import { esc, money, toast, setLoading, emptyState, errorState } from "../ui.js";
import { icon } from "../icons.js";
import { renderIntakeScreen } from "./intake.js";
import { attachAirportPicker } from "../airports.js";

// Flights: the customer describes the trip (direction, cities, dates,
// travelers), sees what the agency's inventory and provider offer, and sends a
// BOOKING REQUEST. Choosing a flight is a preference, not a ticket: the agency
// confirms availability and the price, and nothing here issues a ticket.

const TRIP_TYPES = { ONE_WAY: "ذهاب فقط", ROUND_TRIP: "ذهاب وعودة" };

export async function renderFlightsScreen({ bodyEl, params }) {
  const { item } = params;
  const today = new Date().toISOString().slice(0, 10);
  let tripType = "ONE_WAY";
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("flight", { size: 36 })}</div>
      <h2>تذاكر الطيران</h2>
      <p>ابحث عن رحلتك، ثم أرسل طلب الحجز. يؤكد فريقنا التوفر والسعر قبل أي دفع، ولا يُصدر الطلب تذكرة تلقائيًا.</p>
    </div>
    <form id="flightSearchForm" class="form" novalidate>
      <div class="segmented" id="tripTypeSwitch" role="group" aria-label="اتجاه الرحلة">
        ${Object.entries(TRIP_TYPES).map(([key, label]) => `<button type="button" class="segmented-btn ${key === tripType ? "active" : ""}" data-trip="${key}">${label}</button>`).join("")}
      </div>
      <div class="field-row">
        <label class="field"><span>من (مدينة أو رمز مطار) *</span><input name="from" list="fromList" autocomplete="off" placeholder="الخرطوم أو KRT" dir="auto"><datalist id="fromList"></datalist></label>
        <label class="field"><span>إلى (مدينة أو رمز مطار) *</span><input name="to" list="toList" autocomplete="off" placeholder="جدة أو JED" dir="auto"><datalist id="toList"></datalist></label>
      </div>
      <div class="field-row">
        <label class="field"><span>تاريخ الذهاب *</span><input name="date" type="date" min="${today}"></label>
        <label class="field" id="returnField" hidden><span>تاريخ العودة *</span><input name="returnDate" type="date" min="${today}"></label>
      </div>
      <label class="field"><span>عدد المسافرين</span><input name="travelers" type="number" min="1" max="9" value="1"></label>
      <p class="step-errors" id="flightErrors" role="alert" hidden></p>
      <button type="submit" class="primary" id="flightSearchBtn">بحث عن الرحلات</button>
    </form>
    <div id="flightResults"></div>
  `;

  const form = bodyEl.querySelector("#flightSearchForm");
  const resultsEl = bodyEl.querySelector("#flightResults");
  const errorsEl = bodyEl.querySelector("#flightErrors");
  const fromPicker = attachAirportPicker(form.elements.from, bodyEl.querySelector("#fromList"));
  const toPicker = attachAirportPicker(form.elements.to, bodyEl.querySelector("#toList"));

  bodyEl.querySelector("#tripTypeSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-trip]");
    if (!button) return;
    tripType = button.dataset.trip;
    bodyEl.querySelectorAll("#tripTypeSwitch .segmented-btn").forEach((b) => b.classList.toggle("active", b === button));
    bodyEl.querySelector("#returnField").hidden = tripType !== "ROUND_TRIP";
  });

  function showErrors(messages) {
    errorsEl.hidden = !messages.length;
    errorsEl.innerHTML = messages.map((message) => `<span>${esc(message)}</span>`).join("");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const from = fromPicker.code();
    const to = toPicker.code();
    const problems = [];
    if (!from) problems.push("اختر مدينة أو مطار المغادرة من القائمة، أو اكتب رمز المطار (3 أحرف).");
    if (!to) problems.push("اختر مدينة أو مطار الوصول من القائمة، أو اكتب رمز المطار (3 أحرف).");
    if (from && to && from === to) problems.push("مدينة المغادرة والوصول متطابقتان.");
    if (!data.date) problems.push("اختر تاريخ الذهاب.");
    if (tripType === "ROUND_TRIP") {
      if (!data.returnDate) problems.push("اختر تاريخ العودة.");
      else if (data.date && data.returnDate < data.date) problems.push("تاريخ العودة قبل تاريخ الذهاب.");
    }
    showErrors(problems);
    if (problems.length) return;

    const search = { tripType, from, to, date: data.date, returnDate: tripType === "ROUND_TRIP" ? data.returnDate : "", travelers: Math.max(1, Number(data.travelers) || 1) };
    const submitBtn = bodyEl.querySelector("#flightSearchBtn");
    setLoading(submitBtn, true, "جارٍ البحث…");
    resultsEl.innerHTML = `<div class="loading-block">${icon("clock", { size: 24 })}<p>جارٍ البحث عن الرحلات المتاحة…</p></div>`;
    try {
      const query = new URLSearchParams({ tripType, from, to, date: search.date, travelers: String(search.travelers) });
      if (search.returnDate) query.set("returnDate", search.returnDate);
      const res = await api(`/flights/search?${query.toString()}`);
      setLoading(submitBtn, false);
      renderResults(res, search);
    } catch (error) {
      setLoading(submitBtn, false);
      resultsEl.innerHTML = errorState(error.message);
      toast(error.message, { tone: "error" });
    }
  });

  function renderResults(res, search) {
    const legs = (res.legs || []).map((leg, index) => ({
      index,
      title: index === 0 ? `رحلات الذهاب: ${search.from} ← ${search.to}` : `رحلات العودة: ${search.to} ← ${search.from}`,
      // Only flights the agency published itself. External provider results
      // («trip») stay hidden while the airline integration is postponed: the
      // app never shows availability or fares the agency has not verified.
      flights: [...(leg.manual || [])],
    }));
    const chosen = new Map();

    const noResults = legs.every((leg) => !leg.flights.length);
    resultsEl.innerHTML = `
      ${noResults ? emptyState({ icon: "flight", title: "لا توجد رحلة مطابقة حالياً", hint: "يمكنك إرسال طلب حجز بهذه التفاصيل وسيتحقق فريقنا من البدائل المتاحة." }) : legs.map((leg) => `
        <section class="flight-leg" data-leg="${leg.index}">
          <h3>${esc(leg.title)}</h3>
          ${leg.flights.length ? leg.flights.map((flight, i) => flightCard(flight, leg.index, i, search, res.currency)).join("") : `<p class="field-hint">لا توجد رحلات لهذا الاتجاه في التاريخ المحدد.</p>`}
        </section>`).join("")}
      <div class="flight-actions">
        ${noResults ? "" : `<button class="primary" id="continueWithSelection" disabled>متابعة بطلب الحجز</button>`}
        <button class="${noResults ? "primary" : "link-btn"}" id="requestWithoutSelection">${noResults ? "إرسال طلب حجز بهذه التفاصيل" : "أرسل طلبًا دون اختيار رحلة محددة"}</button>
      </div>`;

    const continueBtn = resultsEl.querySelector("#continueWithSelection");
    const refreshContinue = () => {
      if (continueBtn) continueBtn.disabled = !legs.filter((leg) => leg.flights.length).every((leg) => chosen.has(leg.index));
    };
    resultsEl.querySelectorAll(".pick-flight-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const legIndex = Number(button.dataset.leg);
        const flight = legs[legIndex].flights[Number(button.dataset.index)];
        chosen.set(legIndex, flight);
        resultsEl.querySelectorAll(`.pick-flight-btn[data-leg="${legIndex}"]`).forEach((other) => {
          const active = other === button;
          other.classList.toggle("is-picked", active);
          other.textContent = active ? "تم الاختيار" : "اختيار";
          other.closest(".travel-card").classList.toggle("selected", active);
        });
        refreshContinue();
      });
    });
    continueBtn?.addEventListener("click", () => openIntake(bodyEl, item, flightSelection([...chosen.entries()].sort((a, b) => a[0] - b[0]).map(([, flight]) => flight), search, res.currency)));
    resultsEl.querySelector("#requestWithoutSelection").addEventListener("click", () => openIntake(bodyEl, item, flightSelection([], search, res.currency)));
  }
}

function flightCard(flight, legIndex, index, search, fallbackCurrency) {
  return `
    <div class="travel-card">
      <strong>${esc(flight.airline || flight.carrier || "رحلة")}</strong>
      <span>${esc(flight.originCode || flight.from || search.from)} ← ${esc(flight.destinationCode || flight.to || search.to)}</span>
      <small>${esc(flight.departureAt || flight.departureTime || search.date)}</small>
      ${flight.price ? `<b>${money(flight.price, flight.currency || fallbackCurrency)}</b>` : ""}
      <button type="button" class="secondary pick-flight-btn" data-leg="${legIndex}" data-index="${index}">اختيار</button>
    </div>`;
}

// What the customer picked travels with the request (shown on the form, appended
// to the message, stored in intakeData.selection) so the agency sees it. A price
// seen in the search is an indication only; the agency confirms the price.
function flightSelection(flights, search, currency) {
  const legs = flights.map((flight, index) => {
    const from = flight.originCode || flight.from || (index === 0 ? search.from : search.to);
    const to = flight.destinationCode || flight.to || (index === 0 ? search.to : search.from);
    return {
      direction: index === 0 ? "OUTBOUND" : "RETURN",
      from,
      to,
      departure: flight.departureAt || flight.departureTime || (index === 0 ? search.date : search.returnDate),
      carrier: flight.airline || flight.carrier || "",
      flightNumber: flight.flightNumber || flight.number || null,
      quotedPrice: flight.price ?? null,
      currency: flight.currency || currency || null,
      source: flight.source || null,
      flightId: flight.id ?? null,
    };
  });
  const dates = search.tripType === "ROUND_TRIP" ? `ذهاب ${search.date} وعودة ${search.returnDate}` : `ذهاب ${search.date}`;
  const trip = `${TRIP_TYPES[search.tripType]}: ${search.from} ${search.tripType === "ROUND_TRIP" ? "⇄" : "←"} ${search.to}، ${dates}، عدد المسافرين: ${search.travelers}`;
  const picked = legs
    .map((leg) => `${leg.direction === "OUTBOUND" ? "الذهاب" : "العودة"}: ${leg.carrier ? `${leg.carrier} — ` : ""}${leg.from} ← ${leg.to}، ${leg.departure}${leg.quotedPrice ? `، السعر المعروض عند البحث: ${leg.quotedPrice} ${leg.currency || ""} (يؤكده فريقنا)` : ""}`.trim())
    .join("\n");
  return {
    summary: picked ? `${trip}\n${picked}` : `${trip}\nلم تُختر رحلة محددة؛ سيقترح عليك فريقنا الأنسب.`,
    details: { type: "FLIGHT", tripType: search.tripType, from: search.from, to: search.to, date: search.date, returnDate: search.returnDate || null, travelers: search.travelers, legs },
  };
}

function openIntake(bodyEl, item, selection) {
  // One form at a time: picking again replaces it.
  bodyEl.querySelector("#flightIntakeMount")?.remove();
  const mount = document.createElement("div");
  mount.id = "flightIntakeMount";
  bodyEl.appendChild(mount);
  mount.scrollIntoView({ behavior: "smooth" });
  // The traveller count was given in the search: the form starts with it.
  renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection, initialTravelers: selection.details?.travelers || 1 });
}
