/* GENERATED from backend/public by scripts/sync-static-admin.mjs. Do not edit here: edit backend/public and run `node scripts/sync-static-admin.mjs`. */
// Flight catalogue page (SUPER_ADMIN/ADMIN). External script so the page
// works under the backend's CSP (script-src 'self'; no inline scripts or
// inline event handlers). Every server value is escaped before it reaches
// innerHTML.
const $fm = (id) => document.getElementById(id);

function showFm(message, isError = false) {
  showAlert($fm("alert"), message, isError ? "error" : "success");
}

async function loadRates() {
  const { data } = await api.get("/flights/admin/rates");
  $fm("fx-usd").value = data.USD || "";
  $fm("fx-sar").value = data.SAR || "";
  $fm("fx-aed").value = data.AED || "";
  $fm("fx-egp").value = data.EGP || "";
}

async function loadFlights() {
  const body = $fm("flights-body");
  body.innerHTML = '<tr><td colspan="8" class="muted">جارٍ التحميل...</td></tr>';
  const { data } = await api.get("/flights?limit=100");
  const items = data.items || [];
  body.innerHTML = items.length
    ? items
        .map(
          (f) => `<tr>
            <td>${escapeHtml(f.airline)}</td>
            <td dir="ltr">${escapeHtml(f.flightNumber)}</td>
            <td>${escapeHtml(f.origin?.name)} ← ${escapeHtml(f.destination?.name)}</td>
            <td>${formatDateTime(f.departureAt)}</td>
            <td>${formatMoney(f.price, f.currency)}</td>
            <td>${f.priceSdg == null ? "—" : formatMoney(f.priceSdg, "ج.س")}</td>
            <td>${escapeHtml(f.source)}</td>
            <td>${f.active ? "متاحة" : "موقوفة"}</td>
          </tr>`
        )
        .join("")
    : '<tr><td colspan="8" class="muted">لا توجد رحلات مدخلة.</td></tr>';
}

async function loadBankAccounts() {
  const container = $fm("flight-bank-accounts");
  const { accounts } = await api.get("/flight-bookings/admin/bank-accounts");
  container.innerHTML = (accounts || []).length
    ? `<ul class="plain-list">${accounts
        .map((a) => `<li><strong>${escapeHtml(a.label)}</strong> — ${escapeHtml(a.bank_name || "")} <span dir="ltr">${escapeHtml(a.account_number)}</span> <span class="badge">${a.active ? "نشط" : "موقوف"}</span></li>`)
        .join("")}</ul>`
    : '<p class="alert error" role="alert">لا يوجد حساب دفع نشط؛ لن يتمكن العملاء من رفع إشعار الدفع.</p>';
}

function withBusy(button, fn) {
  return async (event) => {
    if (event) event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    try {
      await fn(event);
    } catch (error) {
      showFm(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
}

async function bootFlightManagement() {
  const user = await requireSession();
  if (!user) return;
  renderHeader(user, "flights");
  if (!["SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    showFm("هذه الصفحة متاحة للمدير فقط.", true);
    document.querySelectorAll("main section").forEach((section) => section.classList.add("hidden"));
    return;
  }

  const saveFx = $fm("save-fx");
  saveFx.addEventListener("click", withBusy(saveFx, async () => {
    await api.patch("/flights/admin/rates", {
      USD: Number($fm("fx-usd").value),
      SAR: Number($fm("fx-sar").value),
      AED: Number($fm("fx-aed").value),
      EGP: Number($fm("fx-egp").value),
    });
    showFm("تم حفظ أسعار الصرف.");
    await loadFlights();
  }));

  const flightForm = $fm("flight-form");
  const flightSubmit = flightForm.querySelector('button[type="submit"]');
  flightForm.addEventListener("submit", withBusy(flightSubmit, async () => {
    const body = Object.fromEntries(new FormData(flightForm));
    body.price = Number(body.price);
    body.stops = Number(body.stops || 0);
    if (body.availableSeats === "") delete body.availableSeats;
    else body.availableSeats = Number(body.availableSeats);
    await api.post("/flights", body);
    showFm("تمت إضافة الرحلة بنجاح.");
    flightForm.reset();
    await loadFlights();
  }));

  const excelForm = $fm("excel-form");
  const excelSubmit = excelForm.querySelector('button[type="submit"]');
  excelForm.addEventListener("submit", withBusy(excelSubmit, async () => {
    const file = $fm("excel-file").files[0];
    if (!file) throw new Error("اختر ملف Excel أولًا.");
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.upload("/flights/import", form);
    $fm("excel-result").classList.remove("hidden");
    $fm("excel-result").textContent = JSON.stringify(data, null, 2);
    showFm(`تم استيراد ${data.imported} رحلة، وفشل ${data.failed}.`);
    await loadFlights();
  }));

  const bankForm = $fm("flight-bank-form");
  const bankSubmit = bankForm.querySelector('button[type="submit"]');
  bankForm.addEventListener("submit", withBusy(bankSubmit, async () => {
    const body = Object.fromEntries(new FormData(bankForm));
    await api.post("/flight-bookings/admin/bank-accounts", body);
    showFm("تم حفظ حساب الدفع.");
    bankForm.reset();
    await loadBankAccounts();
  }));

  const refresh = $fm("refresh");
  refresh.addEventListener("click", withBusy(refresh, loadFlights));

  try {
    await Promise.all([loadRates(), loadFlights(), loadBankAccounts()]);
  } catch (error) {
    showFm(error.message, true);
  }
}

bootFlightManagement();
