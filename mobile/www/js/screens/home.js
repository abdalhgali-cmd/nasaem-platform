import { api } from "../api.js";
import { esc, money, skeletonGrid } from "../ui.js";
import { icon, iconForService } from "../icons.js";
import { getCustomer } from "../auth.js";
import { loadCatalog, loadHomepage } from "../catalog.js";
import { go } from "../router.js";
import { openServiceById, VISAS_HUB_CODE } from "./services.js";

// Order.status (richer enum) vs ContactRequest.status (NEW/CONTACTED/CLOSED
// only — see requests.js's REQUEST_STATUS_AR/REQUEST_OUTCOME_AR for why).
// This widget can show either resource, so it needs both maps.
const ORDER_STATUS_AR = {
  NEW: "جديد",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "قيد التنفيذ",
  APPROVED: "معتمد",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض",
  CANCELLED: "ملغي",
};
const REQUEST_STATUS_AR = { NEW: "جديد", CONTACTED: "تم التواصل", CLOSED: "مغلق" };
const REQUEST_OUTCOME_AR = { COMPLETED: "مكتمل", REJECTED: "مرفوض", CANCELLED: "ملغي" };

const MAIN_SERVICE_ORDER = ["SVC-UMRAH", "SVC-FLIGHT", "VISA-FAMILY-VISIT", "SVC-EGYPT-CLEARANCE", "SVC-HOTEL", "SVC-FERRY", "SVC-INTL-VISA", "SVC-WORK-VISA"];

const VISAS_HUB_CARD = { id: VISAS_HUB_CODE, code: VISAS_HUB_CODE, name: "التأشيرات", category: "visa" };

function pickMainServices(catalog) {
  const byCode = new Map();
  for (const service of catalog.services) byCode.set(service.code, service);
  for (const visaType of catalog.visaTypes) if (!byCode.has(visaType.code)) byCode.set(visaType.code, { ...visaType, isVisaType: true });

  const ordered = MAIN_SERVICE_ORDER.map((code) => byCode.get(code)).filter(Boolean);
  const rest = [...catalog.services, ...catalog.visaTypes].filter((item) => !MAIN_SERVICE_ORDER.includes(item.code));
  return [VISAS_HUB_CARD, ...ordered, ...rest].slice(0, 9);
}

function serviceCard(item) {
  const name = esc(item.name);
  const iconName = iconForService(item);
  return `
    <button class="service-card" data-service-id="${esc(item.id)}" data-service-code="${esc(item.code)}">
      <span class="service-card-icon">${icon(iconName, { size: 24 })}</span>
      <strong>${name}</strong>
    </button>`;
}

export async function renderHomeScreen({ bodyEl }) {
  const customer = getCustomer();
  bodyEl.innerHTML = `
    <section class="home-header">
      <div>
        <span class="eyebrow">أهلاً بك${customer?.fullName ? "، " + esc(customer.fullName.split(" ")[0]) : ""}</span>
        <h1>رحلتك تبدأ معنا بثقة</h1>
        <p>خدمات السفر والعمرة والتأشيرات في مكان واحد</p>
      </div>
      <div class="home-mark"><img src="assets/brand/logo-mark.png" alt="نسائم الحرمين" width="52" height="52"></div>
    </section>

    <section class="quick-actions">
      <button id="quickRequests" class="quick-action">${icon("requests", { size: 20 })}<span>طلباتي</span></button>
      <button id="quickNotifications" class="quick-action">${icon("bell", { size: 20 })}<span>الإشعارات</span></button>
      <button id="quickAccount" class="quick-action">${icon("user", { size: 20 })}<span>حسابي</span></button>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>الخدمات الرئيسية</h2>
        <button class="link-btn" id="seeAllServices">عرض الكل</button>
      </div>
      <div id="servicesGrid" class="services-grid">${skeletonGrid(8)}</div>
    </section>

    <section class="section" id="offersSection" hidden>
      <div class="section-head"><h2>عروض وخدمات مميزة</h2></div>
      <div id="offersList" class="offers-list"></div>
    </section>

    <section class="section" id="lastOrderSection" hidden>
      <div class="section-head"><h2>آخر طلب</h2></div>
      <div id="lastOrderCard"></div>
    </section>
  `;

  bodyEl.querySelector("#quickRequests").addEventListener("click", () => document.querySelector('[data-tab="requests"]')?.click());
  bodyEl.querySelector("#quickNotifications").addEventListener("click", () => document.querySelector('[data-tab="notifications"]')?.click());
  bodyEl.querySelector("#quickAccount").addEventListener("click", () => document.querySelector('[data-tab="account"]')?.click());
  bodyEl.querySelector("#seeAllServices").addEventListener("click", () => go("services", {}, { title: "كل الخدمات", tab: "home" }));

  loadCatalogSection(bodyEl);
  loadOffersSection(bodyEl);
  loadLastOrderSection(bodyEl);
}

async function loadCatalogSection(bodyEl) {
  const grid = bodyEl.querySelector("#servicesGrid");
  try {
    const catalog = await loadCatalog();
    const items = pickMainServices(catalog);
    if (!items.length) {
      grid.innerHTML = `<p class="field-hint">لا توجد خدمات منشورة حالياً.</p>`;
      return;
    }
    grid.innerHTML = items.map(serviceCard).join("");
    grid.querySelectorAll(".service-card").forEach((card) => {
      card.addEventListener("click", () => openServiceById(card.dataset.serviceId, catalog));
    });
  } catch (error) {
    grid.innerHTML = `<p class="field-hint">تعذر تحميل الخدمات: ${esc(error.message)}</p>`;
  }
}

async function loadOffersSection(bodyEl) {
  const section = bodyEl.querySelector("#offersSection");
  const list = bodyEl.querySelector("#offersList");
  try {
    const [homepage, couponsRes] = await Promise.all([
      loadHomepage().catch(() => ({ sections: [] })),
      api("/customer/coupons").catch(() => ({ data: { available: [] } })),
    ]);

    const coupons = (couponsRes.data?.available || []).slice(0, 4).map((coupon) => `
      <div class="offer-card offer-card-coupon">
        <span class="offer-badge">${icon("star", { size: 14 })} كوبون</span>
        <strong>${esc(coupon.code)}</strong>
        <p>${esc(coupon.description || (coupon.discountType === "PERCENTAGE" ? `خصم ${coupon.discountValue}%` : `خصم ${money(coupon.discountValue)}`))}</p>
      </div>`);

    const sections = (homepage.sections || []).slice(0, 4).map((homeSection) => `
      <div class="offer-card">
        <span class="offer-badge">${icon(homeSection.iconKey || "star", { size: 14 })}</span>
        <strong>${esc(homeSection.title)}</strong>
        ${homeSection.description ? `<p>${esc(homeSection.description)}</p>` : ""}
      </div>`);

    const cards = [...coupons, ...sections];
    if (!cards.length) return;
    list.innerHTML = cards.join("");
    section.hidden = false;
  } catch {
    // Offers are a nice-to-have on the home screen — never block the rest
    // of the page on them failing.
  }
}

// Two different resources can be "the last thing a customer did": most
// service flows in this app submit a ContactRequest (the rich,
// requirement-driven case the backend's staff workflow runs on), while
// GET /customer/overview only ever reports the simpler self-checkout Order
// resource. Comparing both and picking the newer one is what makes this
// widget actually reflect "your last order" rather than silently staying
// empty for every customer who only ever used the request flows.
async function loadLastOrderSection(bodyEl) {
  const section = bodyEl.querySelector("#lastOrderSection");
  const card = bodyEl.querySelector("#lastOrderCard");
  try {
    const [overviewRes, requestsRes] = await Promise.all([
      api("/customer/overview").catch(() => ({ data: {} })),
      api("/customer/requests?limit=1").catch(() => ({ data: [] })),
    ]);
    const latestOrder = overviewRes.data?.recentOrders?.[0] || null;
    const latestRequest = requestsRes.data?.[0] || null;

    const orderTime = latestOrder ? new Date(latestOrder.updatedAt || latestOrder.createdAt).getTime() : -1;
    const requestTime = latestRequest ? new Date(latestRequest.updatedAt || latestRequest.createdAt).getTime() : -1;

    if (orderTime < 0 && requestTime < 0) return;

    const useRequest = requestTime >= orderTime;
    const title = useRequest
      ? (latestRequest.service?.name || latestRequest.visaType?.name || "طلب خدمة")
      : (latestOrder.items?.[0]?.service?.name || latestOrder.orderNumber);
    const statusText = useRequest
      ? (latestRequest.status === "CLOSED" && latestRequest.outcome ? REQUEST_OUTCOME_AR[latestRequest.outcome] : REQUEST_STATUS_AR[latestRequest.status]) || latestRequest.status
      : ORDER_STATUS_AR[latestOrder.status] || latestOrder.status;

    card.innerHTML = `
      <button class="last-order-card" id="lastOrderBtn">
        <div class="last-order-icon">${icon("requests", { size: 22 })}</div>
        <div class="last-order-body">
          <strong>${esc(title)}</strong>
          <span class="status-pill">${esc(statusText)}</span>
        </div>
        <span class="chevron">${icon("chevron-start", { size: 18 })}</span>
      </button>`;
    section.hidden = false;
    bodyEl.querySelector("#lastOrderBtn").addEventListener("click", () => {
      if (useRequest) go("requestDetail", { requestId: latestRequest.id }, { title: "تفاصيل الطلب", tab: "requests" });
      else go("orderDetail", { orderId: latestOrder.id }, { title: "تفاصيل الطلب", tab: "requests" });
    });
  } catch {
    // Same posture as offers: silent on failure, the rest of Home still works.
  }
}
