import { esc, toast } from "../ui.js";
import { icon } from "../icons.js";
import { renderIntakeScreen } from "./intake.js";
import { hotelSelection } from "../hotel-selection.js";

// Hotels: the customer describes the stay (city, dates, rooms); every guest
// and the documents the back-office requires for this service follow in the
// shared request form, like every other service. Nothing is booked
// automatically: staff check availability and send a price.
export async function renderHotelsScreen({ bodyEl, params }) {
  const { item } = params;
  const today = new Date().toISOString().slice(0, 10);

  bodyEl.innerHTML = `
    <div class="service-hero">
      <div class="service-hero-icon">${icon("hotel", { size: 36 })}</div>
      <h2>حجز الفنادق</h2>
      <p>أرسل تفاصيل الإقامة، وسيتحقق فريق نسائم الحرمين من التوفر ويرسل لك السعر قبل أي دفع.</p>
    </div>
    <form id="hotelForm" class="form" novalidate>
      <label class="field"><span>المدينة *</span><input name="city" value="مكة المكرمة" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>تاريخ الدخول *</span><input name="checkin" type="date" min="${today}"></label>
        <label class="field"><span>تاريخ الخروج *</span><input name="checkout" type="date" min="${today}"></label>
      </div>
      <label class="field"><span>عدد الغرف *</span><input name="rooms" type="number" min="1" max="10" value="1"></label>
      <label class="field"><span>تفضيلات (اختياري)</span><textarea name="preferences" rows="2" placeholder="نوع الغرفة، القرب من الحرم، أو أي طلب خاص"></textarea></label>
      <p class="field-hint">النزلاء ومستنداتهم في الخطوة التالية.</p>
      <p class="step-errors" id="hotelErrors" role="alert" hidden></p>
      <button type="submit" class="primary" id="hotelSubmitBtn">متابعة بيانات النزلاء</button>
    </form>
    <div id="hotelIntakeMount"></div>
  `;

  const form = bodyEl.querySelector("#hotelForm");
  const errorsEl = bodyEl.querySelector("#hotelErrors");
  const checkinInput = form.querySelector('[name="checkin"]');
  const checkoutInput = form.querySelector('[name="checkout"]');
  checkinInput.addEventListener("change", () => { checkoutInput.min = checkinInput.value || today; });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { problems, selection } = hotelSelection(Object.fromEntries(new FormData(form)), { today });
    errorsEl.hidden = !problems.length;
    errorsEl.innerHTML = problems.map((message) => `<span>${esc(message)}</span>`).join("");
    if (problems.length) return;
    const mount = bodyEl.querySelector("#hotelIntakeMount");
    mount.scrollIntoView({ behavior: "smooth" });
    renderIntakeScreen({ bodyEl: mount, setTitle: () => {}, item, selection }).catch((error) => toast(error.message, { tone: "error" }));
  });
}
