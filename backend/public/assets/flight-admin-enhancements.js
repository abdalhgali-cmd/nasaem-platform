(function () {
  const originalActivateTab = window.activateTab;
  window.activateTab = function (tabKey) {
    if (typeof originalActivateTab === "function") originalActivateTab(tabKey);
    ["overview", "orders", "flight-bookings", "customers", "payments", "management"].forEach((key) => {
      const section = document.getElementById(`tab-${key}`);
      if (section && key === "flight-bookings") section.classList.toggle("hidden", key !== tabKey);
    });
    if (tabKey === "flight-bookings" && typeof window.loadFlightBookings === "function") window.loadFlightBookings();
  };

  async function loadBankAccounts() {
    const container = document.getElementById("flight-bank-accounts");
    if (!container || !window.api) return;
    try {
      const response = await window.api.get("/flight-bookings/admin/bank-accounts");
      const accounts = response.accounts || response.data?.accounts || [];
      container.innerHTML = accounts.map((a) => `<div class="card" style="margin-top:8px"><strong>${a.label}</strong><div>${a.bank_name || ""}</div><div>${a.account_number}</div><span class="badge">${a.active ? "فعال" : "موقوف"}</span></div>`).join("") || '<p class="muted">لا توجد حسابات دفع.</p>';
    } catch (error) { container.innerHTML = `<p class="alert error">${error.message}</p>`; }
  }

  function mountBankAccounts() {
    const section = document.getElementById("tab-management");
    if (!section || document.getElementById("flight-bank-card")) return;
    section.insertAdjacentHTML("beforeend", `<div class="card" id="flight-bank-card"><h2>حسابات دفع الطيران</h2><p class="muted">الحسابات الظاهرة للعميل عند مرحلة الدفع.</p><div class="grid cols-4"><div class="field"><label>المعرف</label><input id="flight-bank-key" placeholder="bank-main"/></div><div class="field"><label>اسم الحساب</label><input id="flight-bank-label" placeholder="حساب البنك الرئيسي"/></div><div class="field"><label>البنك</label><input id="flight-bank-name" placeholder="اسم البنك"/></div><div class="field"><label>رقم الحساب</label><input id="flight-bank-number" placeholder="رقم الحساب"/></div></div><button class="btn" id="save-flight-bank">حفظ الحساب</button><div id="flight-bank-alert" style="margin-top:10px"></div><div id="flight-bank-accounts" style="margin-top:10px"></div></div>`);
    document.getElementById("save-flight-bank").onclick = async () => {
      try {
        const body = { key: document.getElementById("flight-bank-key").value.trim(), label: document.getElementById("flight-bank-label").value.trim(), bankName: document.getElementById("flight-bank-name").value.trim(), accountNumber: document.getElementById("flight-bank-number").value.trim(), active: true };
        const response = await window.api.request("/flight-bookings/admin/bank-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (response) { document.getElementById("flight-bank-alert").innerHTML = '<p class="alert success">تم حفظ حساب الدفع.</p>'; await loadBankAccounts(); }
      } catch (error) { document.getElementById("flight-bank-alert").innerHTML = `<p class="alert error">${error.message}</p>`; }
    };
    loadBankAccounts();
  }

  async function listFlights() {
    const response = await window.api.get("/flights?limit=100");
    return response.data?.items || response.data?.data?.items || [];
  }

  function addInventoryActions() {
    const body = document.getElementById("flights-body");
    if (!body) return;
    const rows = [...body.querySelectorAll("tr")];
    if (!rows.length) return;
    rows.forEach((row) => {
      if (row.querySelector("[data-flight-action]")) return;
      const cells = [...row.children];
      const flightNumber = cells[1]?.textContent?.trim();
      if (!flightNumber) return;
      const action = document.createElement("td");
      action.innerHTML = `<button class="btn secondary" data-flight-action="edit" data-flight-number="${flightNumber}">تعديل</button> <button class="btn secondary" data-flight-action="toggle" data-flight-number="${flightNumber}">تفعيل/إيقاف</button> <button class="btn secondary" data-flight-action="delete" data-flight-number="${flightNumber}">حذف</button>`;
      row.appendChild(action);
    });
  }

  async function refreshInventoryTable() {
    const flights = await listFlights();
    const body = document.getElementById("flights-body");
    if (!body) return;
    body.innerHTML = flights.map((f) => `<tr><td>${f.airline}</td><td>${f.flightNumber}</td><td>${f.origin?.name || ""} → ${f.destination?.name || ""}</td><td>${new Date(f.departureAt).toLocaleString('ar-SD')}</td><td>${Number(f.price).toLocaleString()} ${f.currency}</td><td>${f.priceSdg == null ? '—' : Number(f.priceSdg).toLocaleString() + ' ج.س'}</td><td>${f.source}</td><td>${f.active ? 'متاحة' : 'موقوفة'}</td></tr>`).join("");
    addInventoryActions();
  }

  async function findFlightByNumber(flightNumber) {
    const flights = await listFlights();
    return flights.find((f) => f.flightNumber === flightNumber && f.source === "MANUAL");
  }

  async function editFlight(flightNumber) {
    const flight = await findFlightByNumber(flightNumber);
    if (!flight) throw new Error("الرحلة غير موجودة أو ليست رحلة يدوية.");
    const price = window.prompt(`السعر الأصلي (${flight.currency})`, String(flight.price));
    if (price === null) return;
    const seats = window.prompt("عدد المقاعد", flight.availableSeats == null ? "" : String(flight.availableSeats));
    if (seats === null) return;
    const active = window.confirm("هل تريد أن تكون الرحلة متاحة للعملاء الآن؟");
    await window.api.request(`/flights/${encodeURIComponent(flight.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price: Number(price), availableSeats: seats === "" ? null : Number(seats), active }) });
    await refreshInventoryTable();
    window.alert("تم تحديث الرحلة.");
  }

  async function toggleFlight(flightNumber) {
    const flight = await findFlightByNumber(flightNumber);
    if (!flight) throw new Error("الرحلة غير موجودة أو ليست رحلة يدوية.");
    await window.api.request(`/flights/${encodeURIComponent(flight.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !flight.active }) });
    await refreshInventoryTable();
  }

  async function deleteFlight(flightNumber) {
    const flight = await findFlightByNumber(flightNumber);
    if (!flight) throw new Error("الرحلة غير موجودة أو ليست رحلة يدوية.");
    if (!window.confirm("هل أنت متأكد من حذف الرحلة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    await window.api.request(`/flights/${encodeURIComponent(flight.id)}`, { method: "DELETE" });
    await refreshInventoryTable();
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-flight-action]");
    if (!button) return;
    try {
      const action = button.dataset.flightAction;
      if (action === "edit") await editFlight(button.dataset.flightNumber);
      if (action === "toggle") await toggleFlight(button.dataset.flightNumber);
      if (action === "delete") await deleteFlight(button.dataset.flightNumber);
    } catch (error) { window.alert(error.message || "حدث خطأ"); }
  });

  document.addEventListener("DOMContentLoaded", () => {
    mountBankAccounts();
    setTimeout(addInventoryActions, 300);
  });
})();
