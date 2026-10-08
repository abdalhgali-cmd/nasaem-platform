import { api } from "../api.js";
import { esc, toast, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import { getCustomer } from "../auth.js";
import { go } from "../router.js";

const FALLBACK_ROUTES = ["سواكن → جدة", "جدة → سواكن", "مسار آخر"];
const FALLBACK_CARRIERS = ["تاركو البحرية", "الجودي", "كنزي", "لا يهم"];

export async function renderFerriesScreen({ bodyEl, params }) {
  const { item } = params;
  const customer = getCustomer();
  let routes = FALLBACK_ROUTES;
  let carriers = FALLBACK_CARRIERS;

  try {
    const res = await api("/ferries/public");
    const operators = res.data?.operators || [];
    const schedules = res.data?.schedules || [];
    const liveRoutes = [...new Set(schedules.map((s) => `${s.origin} → ${s.destination}`))];
    if (liveRoutes.length) routes = liveRoutes;
    if (operators.length) carriers = operators.map((operator) => operator.name);
  } catch {
    // Falls back to the same static route/carrier list the web app ships.
  }

  const today = new Date().toISOString().slice(0, 10);
  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("ferry", { size: 36 })}</div>
      <h2>حجوزات البواخر</h2>
      <p>أرسل تفاصيل رحلتك البحرية، وسيتحقق فريق نسائم الحرمين من التوفر والسعر.</p>
    </div>
    <form id="ferryForm" class="form">
      <label class="field">
        <span>المسار *</span>
        <select name="route" required>${routes.map((route) => `<option value="${esc(route)}">${esc(route)}</option>`).join("")}</select>
      </label>
      <div class="field-row">
        <label class="field"><span>تاريخ السفر *</span><input name="travelDate" type="date" min="${today}" required></label>
        <label class="field"><span>عدد المسافرين *</span><input name="travelers" type="number" min="1" max="30" value="1" required></label>
      </div>
      <label class="field">
        <span>الناقل المفضل</span>
        <select name="carrier">${carriers.map((carrier) => `<option value="${esc(carrier)}">${esc(carrier)}</option>`).join("")}</select>
      </label>
      <label class="field"><span>الاسم الكامل *</span><input name="name" required value="${esc(customer?.fullName || "")}"></label>
      <div class="field-row">
        <label class="field"><span>رقم الهاتف *</span><input name="phone" required inputmode="tel" value="${esc(customer?.phone || "")}"></label>
        <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" value="${esc(customer?.email || "")}"></label>
      </div>
      <label class="field"><span>ملاحظات</span><textarea name="notes" rows="3" placeholder="أي تفضيلات إضافية"></textarea></label>
      <button type="submit" class="primary" id="ferrySubmitBtn">إرسال طلب الحجز</button>
    </form>
  `;

  const form = bodyEl.querySelector("#ferryForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const submitBtn = bodyEl.querySelector("#ferrySubmitBtn");
    setLoading(submitBtn, true, "جارٍ الإرسال…");
    try {
      await api("/contact-requests", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          service: "حجز العبارات",
          serviceId: item?.id || undefined,
          travelerCount: Number(data.travelers) || 1,
          intakeData: { route: data.route, travelDate: data.travelDate, travelers: Number(data.travelers) || 1, carrier: data.carrier, notes: data.notes },
          message: `طلب حجز عبارة: ${data.route} بتاريخ ${data.travelDate}، الناقل المفضل: ${data.carrier}، عدد المسافرين: ${data.travelers}. ${data.notes || ""}`,
        }),
      });
      toast("تم إرسال طلب الحجز بنجاح");
      go("requestSubmitted", { serviceName: "حجز العبارات", travelerCount: data.travelers }, { title: "تم الإرسال" });
    } catch (error) {
      setLoading(submitBtn, false);
      toast(error.message, { tone: "error" });
    }
  });
}
