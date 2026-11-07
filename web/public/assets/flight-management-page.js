/* GENERATED from backend/public by scripts/sync-static-admin.mjs. Do not edit here: edit backend/public and run `node scripts/sync-static-admin.mjs`. */
// Flight catalogue page (SUPER_ADMIN/ADMIN). External script so the page
// works under the backend's CSP (script-src 'self'; no inline scripts or
// inline event handlers). Every server value is escaped before it reaches
// innerHTML.
const $fm = (id) => document.getElementById(id);

function showFm(message, isError = false) {
  showAlert($fm("alert"), message, isError ? "error" : "success");
}

const FX_CODES = [["USD", "دولار أمريكي"], ["SAR", "ريال سعودي"], ["AED", "درهم إماراتي"], ["EGP", "جنيه مصري"]];

const fxText = (value) => (value === null || value === undefined ? "غير فعّال" : String(value));
const fxSummary = (rates) => FX_CODES.map(([code]) => `${code}: ${fxText(rates?.[code])}`).join(" · ");

async function loadRates() {
  const { data } = await api.get("/flights/admin/rates/status");
  $fm("fx-body").innerHTML = FX_CODES.map(([code, name]) => {
    const row = data[code] || { active: false, rate: null, updatedAt: null };
    return `<tr>
      <td><strong dir="ltr">${escapeHtml(code)}</strong> <span class="muted">${escapeHtml(name)}</span></td>
      <td>${row.active ? '<span class="badge status-ACTIVE">فعّال</span>' : '<span class="badge status-INACTIVE">غير فعّال</span>'}</td>
      <td><input id="fx-${code}" type="number" min="0.000001" step="0.000001" dir="ltr" value="${row.active ? escapeHtml(row.rate) : ""}" aria-label="سعر ${escapeHtml(code)}" /></td>
      <td>${row.updatedAt ? escapeHtml(formatDateTime(row.updatedAt)) : "-"}</td>
      <td><div class="stack wrap">
        <button type="button" class="btn" data-fx-save="${code}">${row.active ? "حفظ السعر" : "تفعيل بهذا السعر"}</button>
        ${row.active ? `<button type="button" class="btn secondary" data-fx-off="${code}">إيقاف</button>` : ""}
      </div></td>
    </tr>`;
  }).join("");
  await loadRateHistory();
}

async function loadRateHistory() {
  const { data } = await api.get("/flights/admin/rates/history");
  $fm("fx-history-body").innerHTML = data.length
    ? data
        .map(
          (row) => `<tr>
        <td>${escapeHtml(formatDateTime(row.createdAt))}</td>
        <td>${escapeHtml(row.user?.fullName || "-")}</td>
        <td dir="ltr" class="small">${escapeHtml(fxSummary(row.oldValue))}</td>
        <td dir="ltr" class="small">${escapeHtml(fxSummary(row.newValue))}</td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="4" class="muted">لا توجد تغييرات مسجّلة بعد.</td></tr>';
}

async function changeRate(code, value) {
  await api.patch("/flights/admin/rates", { [code]: value });
  showFm(value === null ? `تم إيقاف ${code}.` : `تم حفظ سعر ${code} وتفعيله.`);
  await loadRates();
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

  $fm("fx-body").addEventListener("click", async (event) => {
    const save = event.target.closest("[data-fx-save]");
    const off = event.target.closest("[data-fx-off]");
    try {
      if (save) {
        const code = save.dataset.fxSave;
        const value = Number($fm(`fx-${code}`).value);
        if (!(value > 0)) return showFm("اكتب سعر صرف أكبر من صفر.", true);
        await changeRate(code, value);
      } else if (off) {
        if (!window.confirm(`إيقاف ${off.dataset.fxOff}؟ لن يظهر لها مقابل بالجنيه حتى تُفعَّل من جديد.`)) return;
        await changeRate(off.dataset.fxOff, null);
      }
    } catch (error) {
      showFm(error.message, true);
    }
  });

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
