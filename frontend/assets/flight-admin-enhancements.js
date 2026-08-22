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

  document.addEventListener("DOMContentLoaded", mountBankAccounts);
})();
