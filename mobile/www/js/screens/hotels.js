import { api } from "../api.js";
import { esc, toast, setLoading } from "../ui.js";
import { icon } from "../icons.js";
import { getCustomer } from "../auth.js";
import { go } from "../router.js";

export async function renderHotelsScreen({ bodyEl, params }) {
  const { item } = params;
  const customer = getCustomer();
  const today = new Date().toISOString().slice(0, 10);

  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("hotel", { size: 36 })}</div>
      <h2>حجز الفنادق</h2>
      <p>أرسل تفاصيل الإقامة، وسيتحقق فريق نسائم الحرمين من التوفر ويعود إليك بالعرض المناسب.</p>
    </div>
    <form id="hotelForm" class="form">
      <label class="field"><span>المدينة *</span><input name="city" required value="مكة المكرمة"></label>
      <div class="field-row">
        <label class="field"><span>تاريخ الدخول *</span><input name="checkin" type="date" min="${today}" required></label>
        <label class="field"><span>تاريخ الخروج *</span><input name="checkout" type="date" min="${today}" required></label>
      </div>
      <div class="field-row">
        <label class="field"><span>عدد النزلاء *</span><input name="guests" type="number" min="1" max="20" value="1" required></label>
        <label class="field"><span>عدد الغرف *</span><input name="rooms" type="number" min="1" max="10" value="1" required></label>
      </div>
      <label class="field"><span>الاسم الكامل *</span><input name="name" required value="${esc(customer?.fullName || "")}"></label>
      <div class="field-row">
        <label class="field"><span>رقم الهاتف *</span><input name="phone" required inputmode="tel" value="${esc(customer?.phone || "")}"></label>
        <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" value="${esc(customer?.email || "")}"></label>
      </div>
      <label class="field"><span>ملاحظات</span><textarea name="notes" rows="3" placeholder="نوع الغرفة، قرب الفندق من الحرم، أو أي طلب خاص"></textarea></label>
      <button type="submit" class="primary" id="hotelSubmitBtn">إرسال طلب الفندق</button>
    </form>
  `;

  const form = bodyEl.querySelector("#hotelForm");
  const checkinInput = form.querySelector('[name="checkin"]');
  const checkoutInput = form.querySelector('[name="checkout"]');
  checkinInput.addEventListener("change", () => { checkoutInput.min = checkinInput.value || today; });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data.checkout <= data.checkin) {
      toast("تاريخ المغادرة يجب أن يكون بعد تاريخ الدخول", { tone: "error" });
      return;
    }
    const submitBtn = bodyEl.querySelector("#hotelSubmitBtn");
    setLoading(submitBtn, true, "جارٍ الإرسال…");
    try {
      await api("/contact-requests", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          email: data.email || undefined,
          service: "حجز الفنادق",
          serviceId: item?.id || undefined,
          travelerCount: Number(data.guests) || 1,
          intakeData: { city: data.city, checkin: data.checkin, checkout: data.checkout, guests: Number(data.guests) || 1, rooms: Number(data.rooms) || 1, notes: data.notes },
          message: `طلب فندق في ${data.city} من ${data.checkin} إلى ${data.checkout}، عدد النزلاء ${data.guests}، الغرف ${data.rooms}. ${data.notes || ""}`,
        }),
      });
      toast("تم إرسال طلب الفندق بنجاح");
      go("requestSubmitted", { serviceName: "حجز الفنادق", travelerCount: data.guests }, { title: "تم الإرسال" });
    } catch (error) {
      setLoading(submitBtn, false);
      toast(error.message, { tone: "error" });
    }
  });
}
