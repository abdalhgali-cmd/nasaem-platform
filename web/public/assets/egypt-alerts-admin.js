/* GENERATED from backend/public by scripts/sync-static-admin.mjs. Do not edit here: edit backend/public and run `node scripts/sync-static-admin.mjs`. */
// Alert lead times of the Egypt approval work (Egypt tab → «إعدادات
// التنبيهات»). Staff can read them; only administrators can save (the API
// enforces it — hiding the form for others is only a UX measure). Saving a
// new travel-reminder lead time re-plans the open requests' reminders.
const EGYPT_ALERT_FIELDS = [
  ["travelReminderDaysBefore", "تذكير السفر قبل (أيام)", 1, 30],
  ["travelReminderLocalHour", "ساعة التذكير (بتوقيت الخرطوم)", 0, 23],
  ["paymentReviewHours", "تنبيه إشعار دفع لم يُراجع بعد (ساعات)", 1, 720],
  ["approvalIssuanceHours", "تنبيه موافقة لم تصدر بعد الدفع (ساعات)", 1, 720],
  ["circularLeadDays", "تنبيه تعميم لم يصدر قبل السفر بـ (أيام)", 0, 30],
  ["missingTravelDocsLeadDays", "تنبيه بيانات سفر ناقصة قبل السفر بـ (أيام)", 0, 60],
  ["unassignedHours", "تنبيه طلب بلا موظف بعد (ساعات)", 1, 720],
];

function mountEgyptAlertsAdmin(root) {
  const canEdit = ["SUPER_ADMIN", "ADMIN"].includes(currentUser?.role);
  const wrap = document.createElement("section");
  wrap.className = "card";
  wrap.dataset.egyptAlertsAdmin = "1";
  wrap.innerHTML = `
    <details>
      <summary><strong>إعدادات التنبيهات</strong></summary>
      <p class="muted small">متى يُنبَّه الموظفون: تذكير السفر، وإشعارات الدفع غير المراجعة، والموافقات والتعميمات المتأخرة، والبيانات الناقصة، والطلبات بلا موظف. كل تنبيه يُرسل مرة واحدة لكل حالة، ويُعاد حسابه عند تغيير تاريخ السفر.</p>
      <div id="egypt-alerts-message" role="status" aria-live="polite"></div>
      <form id="egypt-alerts-form" class="stack" hidden>
        <div class="grid cols-3">
          ${EGYPT_ALERT_FIELDS.map(([name, label, min, max]) => `
            <div class="field"><label for="egypt-alert-${name}">${escapeHtml(label)}</label>
              <input id="egypt-alert-${name}" name="${name}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" required ${canEdit ? "" : "disabled"} /></div>`).join("")}
        </div>
        ${canEdit ? '<div class="stack"><button class="btn" type="submit" id="egypt-alerts-save">حفظ إعدادات التنبيهات</button></div>' : '<p class="muted small">تعديل الإعدادات من صلاحيات الإدارة.</p>'}
      </form>
    </details>`;
  root.prepend(wrap);
  const form = wrap.querySelector("#egypt-alerts-form");
  const message = wrap.querySelector("#egypt-alerts-message");
  const show = (text, kind = "info") => {
    message.innerHTML = text ? `<p class="alert ${kind === "error" ? "error" : kind === "success" ? "success" : "warning"}">${escapeHtml(text)}</p>` : "";
  };
  let loaded = false;

  async function load() {
    try {
      const { data } = await api.get("/contact-requests/egypt/alert-settings");
      for (const [name] of EGYPT_ALERT_FIELDS) form.elements.namedItem(name).value = data.settings[name];
      form.hidden = false;
      loaded = true;
      show("");
    } catch (error) {
      show(`تعذّر تحميل الإعدادات: ${error.message}`, "error");
    }
  }
  wrap.querySelector("details").addEventListener("toggle", (event) => {
    if (event.target.open && !loaded) load();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    const payload = {};
    for (const [name, label, min, max] of EGYPT_ALERT_FIELDS) {
      const value = Number(form.elements.namedItem(name).value);
      if (!Number.isInteger(value) || value < min || value > max) {
        show(`«${label}» يجب أن يكون عددًا صحيحًا بين ${min} و${max}.`, "error");
        return;
      }
      payload[name] = value;
    }
    const save = wrap.querySelector("#egypt-alerts-save");
    save.disabled = true;
    try {
      const { data } = await api.put("/contact-requests/egypt/alert-settings", payload);
      show(data.rescheduled ? `تم الحفظ، وأُعيدت جدولة تذكيرات ${data.rescheduled} طلبًا.` : "تم حفظ إعدادات التنبيهات.", "success");
    } catch (error) {
      show(`تعذّر الحفظ: ${error.message}`, "error");
    } finally {
      save.disabled = false;
    }
  });
}
