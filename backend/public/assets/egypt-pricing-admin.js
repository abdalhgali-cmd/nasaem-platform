// Dedicated price/availability settings inside the Egypt tab. The API is
// administrator-only; hiding the editor from employees is only a UX measure.
// The posted values are NOT defaults: the real agency configuration is read
// from the database and saved by a single, validated server transaction.
function mountEgyptPricingAdmin(root) {
  if (!["SUPER_ADMIN", "ADMIN"].includes(currentUser?.role)) return;
  const wrap = document.createElement("section");
  wrap.className = "card";
  wrap.dataset.egyptPricingAdmin = "1";
  wrap.innerHTML = `
    <details>
      <summary><strong>ضبط الخدمة والأسعار — الموافقة الأمنية لمصر</strong></summary>
      <p class="muted small">تحكّم في أسعار الجوي والبري، وتفعيل كل نوع، وسعر الدولار. تظهر القيم المعتمدة للعملاء فور حفظها في الخادم. تحديث الدولار يؤثر كذلك على بقية خدمات الوكالة المسعّرة بالدولار.</p>
      <div id="egypt-pricing-message" role="status" aria-live="polite"></div>
      <form id="egypt-pricing-form" class="stack" hidden>
        <div class="grid cols-3">
          <div class="field">
            <label for="egypt-price-air">سعر الموافقة الجوي (دولار/مسافر)</label>
            <input id="egypt-price-air" name="airPrice" type="number" required min="0.01" step="0.01" inputmode="decimal" />
            <label class="stack wrap"><input name="airActive" type="checkbox" /> تفعيل الجوي للعملاء</label>
            <span class="muted small" id="egypt-price-air-sdg"></span>
          </div>
          <div class="field">
            <label for="egypt-price-border">سعر الموافقة البري (دولار/مسافر)</label>
            <input id="egypt-price-border" name="borderPrice" type="number" required min="0.01" step="0.01" inputmode="decimal" />
            <label class="stack wrap"><input name="borderActive" type="checkbox" /> تفعيل البري للعملاء</label>
            <span class="muted small" id="egypt-price-border-sdg"></span>
          </div>
          <div class="field">
            <label for="egypt-price-usd">سعر الدولار بالجنيه السوداني</label>
            <input id="egypt-price-usd" name="usdRate" type="number" required min="0.01" step="0.01" inputmode="decimal" />
            <p class="muted small">السعر مشترك مع باقي خدمات الوكالة. لا تغيّر أسعار الطلبات السابقة.</p>
          </div>
        </div>
        <div class="stack wrap">
          <button class="btn" type="submit" id="egypt-pricing-save">حفظ الأسعار والحالة</button>
          <button class="btn secondary" type="button" id="egypt-pricing-reload">استعادة القيم المحفوظة</button>
        </div>
      </form>
    </details>`;
  root.prepend(wrap);
  const $ = (selector) => wrap.querySelector(selector);
  const form = $("#egypt-pricing-form");
  const message = $("#egypt-pricing-message");
  const get = (name) => form.elements.namedItem(name);
  let loaded = false;

  function alertText(text, kind = "info") {
    message.innerHTML = text ? `<p class="alert ${kind === "error" ? "error" : kind === "success" ? "success" : "warning"}">${escapeHtml(text)}</p>` : "";
  }
  function preview() {
    const rate = Number(get("usdRate").value);
    for (const [name, label] of [["airPrice", "#egypt-price-air-sdg"], ["borderPrice", "#egypt-price-border-sdg"]]) {
      const usd = Number(get(name).value);
      $(label).textContent = usd > 0 && rate > 0
        ? `يعادل ${Math.round(usd * rate).toLocaleString("en-US")} جنيه سوداني للمسافر`
        : "أدخل السعر وسعر الدولار لإظهار المقابل بالجنيه.";
    }
  }
  async function reload() {
    form.hidden = true;
    alertText("جارٍ تحميل إعدادات الخدمة...");
    try {
      const response = await api.get("/visa-types/egypt/config");
      const data = response.data || {};
      get("airPrice").value = data.air?.priceUsd > 0 ? String(data.air.priceUsd) : "";
      get("borderPrice").value = data.border?.priceUsd > 0 ? String(data.border.priceUsd) : "";
      get("usdRate").value = data.usdRateToSdg > 0 ? String(data.usdRateToSdg) : "";
      get("airActive").checked = Boolean(data.air?.active);
      get("borderActive").checked = Boolean(data.border?.active);
      loaded = true;
      form.hidden = false;
      preview();
      alertText(data.air?.exists && data.border?.exists
        ? ""
        : "أحد نوعَي الموافقة لم يُهيَّأ بعد؛ عند الحفظ سينشئ الخادم النوع الناقص ويضيف متطلبات الجواز من الخدمة الأساسية.");
    } catch (error) {
      loaded = false;
      alertText(`تعذّر تحميل الإعدادات: ${error.message}`, "error");
    }
  }

  wrap.querySelector("details").addEventListener("toggle", (event) => {
    if (event.target.open && !loaded) void reload();
  });
  $("#egypt-pricing-reload").addEventListener("click", reload);
  form.addEventListener("input", preview);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      usdRateToSdg: Number(get("usdRate").value),
      air: { priceUsd: Number(get("airPrice").value), active: get("airActive").checked },
      border: { priceUsd: Number(get("borderPrice").value), active: get("borderActive").checked },
    };
    if (![payload.usdRateToSdg, payload.air.priceUsd, payload.border.priceUsd].every((n) => Number.isFinite(n) && n > 0)) {
      alertText("السعر وسعر الدولار يجب أن يكونا أكبر من صفر.", "error");
      return;
    }
    if (!window.confirm("تأكيد حفظ أسعار الموافقة وحالتها؟ تغيير سعر الدولار يؤثر كذلك على أسعار الخدمات الأخرى بالدولار.")) return;
    const save = $("#egypt-pricing-save");
    save.disabled = true;
    alertText("جارٍ حفظ الإعدادات...");
    try {
      const response = await api.patch("/visa-types/egypt/config", payload);
      alertText(response.warning || "تم حفظ الأسعار والحالة بنجاح. ستظهر القيم الجديدة للطلبات القادمة.", response.warning ? "warning" : "success");
      const data = response.data;
      get("airActive").checked = Boolean(data?.air?.active);
      get("borderActive").checked = Boolean(data?.border?.active);
      preview();
    } catch (error) {
      alertText(`تعذّر حفظ الإعدادات: ${error.message}. تحقّق من القيم المحفوظة قبل إعادة المحاولة.`, "error");
    } finally {
      save.disabled = false;
    }
  });
}
