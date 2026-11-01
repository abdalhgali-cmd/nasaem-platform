import { api } from "../api.js";
import { esc, skeletonGrid } from "../ui.js";
import { icon, iconForService } from "../icons.js";
import { getCustomer, isAccountUnlocked } from "../auth.js";
import { loadCatalog, loadPackages } from "../catalog.js";
import { go, goToTab } from "../router.js";
import { openServiceById, openServiceItem, VISAS_HUB_CODE } from "./services.js";
import { homeBentoTiles } from "../service-view.js";
import { firstName, greeting, readPendingPayment } from "../experience-core.js";
import { stagger, tapFeedback } from "../motion.js";
import { loadAgency, whatsappLink } from "../agency.js";
import { umrahKindOffers, UMRAH_UNAVAILABLE } from "../umrah-view.js";
import { egyptVariantOptions } from "../egypt-view.js";

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

const MAIN_SERVICE_ORDER = ["SVC-UMRAH", "SVC-FLIGHT", "SVC-HOTEL", "SVC-FERRY"];


function pickMainServices(catalog) {
  const byCode = new Map();
  for (const service of catalog.services) byCode.set(service.code, service);
  for (const visaType of catalog.visaTypes) if (!byCode.has(visaType.code)) byCode.set(visaType.code, { ...visaType, isVisaType: true });

  const ordered = MAIN_SERVICE_ORDER.map((code) => byCode.get(code)).filter(Boolean);
  return [{ id: VISAS_HUB_CODE, code: VISAS_HUB_CODE, name: "التأشيرات", category: "visa" }, ...ordered];
}

function serviceCard(item) {
  const name = esc(item.name);
  const iconName = iconForService(item);
  return `
    <button class="service-card" data-service-id="${esc(item.id)}" data-service-code="${esc(item.code)}" aria-label="${name}">
      <span class="service-card-icon">${icon(iconName, { size: 26 })}</span>
      <strong>${name}</strong>
    </button>`;
}

// Public home for everyone. Personal parts (name, bell, coupons, account
// activity) appear only for a verified, unlocked account; a guest gets the
// public content and a clear "track your request" action instead.
export async function renderHomeScreen({ bodyEl }) {
  const signedIn = isAccountUnlocked();
  const customer = signedIn ? getCustomer() : null;
  const name = firstName(customer?.fullName);
  bodyEl.innerHTML = `
    <header class="hc-top">
      <img class="hc-mark" src="assets/brand/logo-mark.png" alt="شعار نسائم الحرمين" width="44" height="44">
      <div class="hc-greeting">
        <small>${signedIn ? `${esc(greeting())}${name ? `، ${esc(name)}` : ""}` : "نسائم الحرمين"}</small>
        <h1>${signedIn ? "نسائم الحرمين" : "أهلاً بك"}</h1>
      </div>
      ${signedIn ? `<button class="hc-icon-btn home-bell" id="homeBell" aria-label="الإشعارات">
        ${icon("bell", { size: 22 })}<span class="home-bell-dot" id="homeBellDot" hidden></span>
      </button>` : ""}
    </header>
    <div id="pendingPaymentMount"></div>

    <section class="section home-current-request" id="activitySection" hidden>
      <div class="section-head"><h2 id="activityTitle">طلبك الحالي</h2></div>
      <div class="activity-list" id="activityList"></div>
    </section>

    <section class="hc-bento-wrap" aria-label="خدمات الوكالة">
      <div class="hc-section-intro">
        <h2>اختر خدمتك</h2>
        <p>ابدأ طلب العمرة أو الموافقة الأمنية لمصر، دون إنشاء حساب.</p>
      </div>
      <p class="field-hint stale-note" id="catalogStale" hidden>${icon("wifi-off", { size: 14 })} تعذر تحديث الخدمات الآن؛ المعروض آخر نسخة محفوظة وقد لا تكون محدثة.</p>
      <div class="hc-bento" id="homeBento">${skeletonGrid(4)}</div>
    </section>

    <section class="section">
      <button class="track-card" id="homeTrackBtn">
        <span class="track-card-icon">${icon("requests", { size: 22 })}</span>
        <span class="track-card-body"><b>تتبع الطلب</b><small>${signedIn ? "تابع حالة طلباتك وسعرها ودفعها" : "برقم هاتفك ورمز تحقق عبر واتساب، دون حساب"}</small></span>
        ${icon("chevron-start", { size: 18 })}
      </button>
    </section>

    <section class="section home-journey" aria-label="كيف يعمل طلبك">
      <div class="section-head"><h2>خطوات واضحة من البداية</h2></div>
      <ol class="home-journey-grid">
        <li><span>١</span><strong>اختر الخدمة</strong></li>
        <li><span>٢</span><strong>أرسل المتطلبات</strong></li>
        <li><span>٣</span><strong>ادفع للحساب المعتمد</strong></li>
        <li><span>٤</span><strong>تابع حتى التسليم</strong></li>
      </ol>
    </section>

    <section class="section">
      <a class="help-strip" id="helpStrip" href="#">
        <span class="help-strip-icon">${icon("chat", { size: 22 })}</span>
        <span class="help-strip-body"><b>تحتاج مساعدة في طلبك؟</b><small>تواصل مع فريق نسائم الحرمين عبر واتساب</small></span>
        ${icon("chevron-start", { size: 18 })}
      </a>
    </section>
  `;
  showPendingPayment(bodyEl.querySelector("#pendingPaymentMount"));

  bodyEl.querySelector("#homeBell")?.addEventListener("click", () => {
    tapFeedback();
    go("notifications", {}, { title: "الإشعارات", tab: "home" });
  });
  bodyEl.querySelector("#homeTrackBtn")?.addEventListener("click", () => goToTab("requests", "requests", { title: "طلباتي" }));

  loadCatalogSection(bodyEl);
  if (signedIn) loadActivitySection(bodyEl);
  loadAgency().then((agency) => {
    const strip = bodyEl.querySelector("#helpStrip");
    if (strip) strip.href = whatsappLink(agency.whatsapp, "السلام عليكم، أحتاج مساعدة في طلبي");
  });

  return { cleanup: () => {} };
}

// One bento tile per published service; the label is the catalog's own name.
function bentoTile(shortcut) {
  const label = shortcut.item?.name || shortcut.label;
  return `
    <button type="button" class="hc-tile" data-key="${esc(shortcut.key)}">
      <span class="hc-tile-icon">${icon(shortcut.icon, { size: 22 })}</span>
      <span class="hc-tile-label">${esc(label)}</span>
    </button>`;
}

// The Umrah feature tile is derived from the published catalog, never a
// simulated package or price. The normal service dispatcher keeps each
// package's actual price, document requirements and payment flow intact.
function publishedUmrah(catalog) {
  const services = [...(catalog.services || []), ...(catalog.visaTypes || [])];
  return services.find((item) => item.code === "SVC-UMRAH") || services.find((item) => item.code === "VISA-UMRAH") || null;
}

function umrahTile() {
  return `
    <article class="hc-tile hc-tile-feature home-umrah-hero">
      <span class="home-umrah-orbit" aria-hidden="true"></span>
      <div class="home-umrah-heading">
        <span class="hc-tile-icon">${icon("umrah", { size: 24 })}</span>
        <span class="home-umrah-kicker">رحلتك إلى بيت الله</span>
      </div>
      <span class="hc-feature-copy"><strong>عمرة بخطوات واضحة</strong><small>اختر تأشيرة فقط أو باقة مع خدمات الطيران أو البحر، واعرف السعر قبل إرسال الطلب.</small></span>
      <div class="home-umrah-assurances" aria-label="مزايا الطلب">
        <span>${icon("check-circle", { size: 14 })} سعر منشور</span>
        <span>${icon("requests", { size: 14 })} متابعة مباشرة</span>
      </div>
      <ul class="hc-umrah-kinds" id="homeUmrahKinds" aria-label="أنواع العمرة وأسعارها" hidden></ul>
      <button type="button" class="hc-feature-cta" id="homeUmrahBtn">اختر باقة العمرة ${icon("chevron-start", { size: 18 })}</button>
    </article>`;
}

// The published Umrah kinds with their real prices (/services/public/packages).
// A bookable kind opens its package directly; one without a fixed price says
// it is unavailable. Without packages, or if they fail to load, the card
// keeps its description and the main button.
async function fillUmrahKinds(bento, umrah) {
  const list = bento.querySelector("#homeUmrahKinds");
  if (!list) return;
  try {
    const offers = umrahKindOffers(await loadPackages());
    if (!offers.length) return;
    list.innerHTML = offers.map((offer) => `
      <li>
        ${offer.packageId
          ? `<button type="button" class="hc-umrah-kind" data-package-id="${esc(offer.packageId)}">
              <span class="hc-umrah-kind-label">${esc(offer.label)}</span>
              <span class="hc-umrah-kind-price"><bdi>${esc(offer.priceText)}</bdi>${offer.sdgText ? `<small><bdi>${esc(offer.sdgText)}</bdi></small>` : ""}</span>
            </button>`
          : `<div class="hc-umrah-kind is-unavailable">
              <span class="hc-umrah-kind-label">${esc(offer.label)}</span>
              <span class="hc-umrah-kind-price is-pending">${esc(UMRAH_UNAVAILABLE)}</span>
            </div>`}
      </li>`).join("");
    list.querySelectorAll("[data-package-id]").forEach((button) => {
      button.addEventListener("click", () => { tapFeedback(); openServiceItem(umrah, { packageId: button.dataset.packageId }); });
    });
    list.hidden = false;
  } catch {
    list.hidden = true;
  }
}

function egyptTile(options) {
  return `
    <div class="hc-tile hc-tile-egypt">
      <span class="hc-egypt-head"><span class="hc-tile-icon">${icon("shield-check", { size: 22 })}</span><strong>الموافقة الأمنية لمصر</strong></span>
      <div class="hc-egypt-options">
        ${options.map((option) => option.bookable
          ? `<button type="button" class="hc-egypt-option" data-egypt-variant="${esc(option.code)}">
              <span>${esc(option.name)}</span>
              <b><bdi>${esc(option.priceText)}</bdi></b>
              ${option.sdgText ? `<small><bdi>${esc(option.sdgText)}</bdi></small>` : ""}
            </button>`
          : `<div class="hc-egypt-option is-unavailable"><span>${esc(option.name)}</span><small>${esc(option.priceText)}</small></div>`).join("")}
      </div>
    </div>`;
}

async function loadCatalogSection(bodyEl) {
  const bento = bodyEl.querySelector("#homeBento");
  try {
    const catalog = await loadCatalog();
    bodyEl.querySelector("#catalogStale").hidden = !catalog.stale;

    // Bento in priority order: Umrah feature, flights, ferries, the visas hub
    // (with its live count), Egypt clearance, family visit, then every
    // service. Each tile opens the real published service; counts come from
    // the catalog. Hotels are postponed and never shown.
    const umrah = publishedUmrah(catalog);
    const shortcuts = homeBentoTiles(catalog);
    // Egypt approval: its own card with both entry methods' fixed prices
    // (USD + the server's SDG) when the agency published them.
    const egyptOptions = egyptVariantOptions(catalog);
    const egyptCard = egyptOptions.some((option) => option.bookable) ? egyptTile(egyptOptions) : "";
    bento.innerHTML = [
      umrah ? umrahTile() : "",
      egyptCard,
      ...shortcuts.filter((shortcut) => !(egyptCard && shortcut.key === "egypt")).map((shortcut) => shortcut.hub
        ? `<button type="button" class="hc-tile hc-tile-wide" data-key="visas">
            <span class="hc-tile-icon">${icon("visa", { size: 22 })}</span>
            <span class="hc-tile-label">التأشيرات والموافقات<small>${esc(serviceCountText(visaCount))}</small></span>
            ${icon("chevron-start", { size: 18 })}
          </button>`
        : bentoTile(shortcut)),
    ].join("");
    stagger(bento);
    if (umrah) fillUmrahKinds(bento, umrah);
    bento.querySelectorAll("[data-egypt-variant]").forEach((button) => {
      button.addEventListener("click", () => {
        tapFeedback();
        const option = egyptOptions.find((candidate) => candidate.code === button.dataset.egyptVariant);
        if (option?.item) openServiceItem(option.item, { variantCode: option.code });
      });
    });
    bento.querySelector("#homeUmrahBtn")?.addEventListener("click", () => { tapFeedback(); openServiceItem(umrah); });
    bento.querySelectorAll(".hc-tile[data-key]").forEach((button) => {
      button.addEventListener("click", () => {
        tapFeedback();
        const shortcut = shortcuts.find((candidate) => candidate.key === button.dataset.key);
        if (shortcut?.hub) openServiceById(VISAS_HUB_CODE, catalog);
        else if (shortcut?.item) openServiceItem(shortcut.item);
      });
    });

  } catch (error) {
    bento.innerHTML = `<p class="field-hint">تعذر تحميل الخدمات: ${esc(error.message)}</p>`;
  }
}

// Two different resources can be "the last thing a customer did": most
// service flows in this app submit a ContactRequest (the rich,
// requirement-driven case the backend's staff workflow runs on), while
// GET /customer/overview only ever reports the simpler self-checkout Order
// resource. Comparing both and picking the newer one is what makes this
// widget actually reflect "your last order" rather than silently staying
// empty for every customer who only ever used the request flows.
async function loadActivitySection(bodyEl) {
  const section = bodyEl.querySelector("#activitySection");
  const list = bodyEl.querySelector("#activityList");
  try {
    const [overviewRes, requestsRes, notificationsRes] = await Promise.all([
      api("/customer/overview").catch(() => ({ data: {} })),
      api("/customer/requests?limit=1").catch(() => ({ data: [] })),
      api("/customer/notifications?limit=10").catch(() => ({ data: [] })),
    ]);
    if (!list.isConnected) return;
    const cards = [];
    let hasCurrentRequest = false;

    const latestOrder = overviewRes.data?.recentOrders?.[0] || null;
    const latestRequest = requestsRes.data?.[0] || null;
    const orderTime = latestOrder ? new Date(latestOrder.updatedAt || latestOrder.createdAt).getTime() : -1;
    const requestTime = latestRequest ? new Date(latestRequest.updatedAt || latestRequest.createdAt).getTime() : -1;
    let openLatest = null;

    if (orderTime >= 0 || requestTime >= 0) {
      hasCurrentRequest = true;
      const useRequest = requestTime >= orderTime;
      const title = useRequest
        ? (latestRequest.service?.name || latestRequest.visaType?.name || "طلب خدمة")
        : (latestOrder.items?.[0]?.service?.name || latestOrder.orderNumber);
      const statusText = useRequest
        ? (latestRequest.status === "CLOSED" && latestRequest.outcome ? REQUEST_OUTCOME_AR[latestRequest.outcome] : REQUEST_STATUS_AR[latestRequest.status]) || latestRequest.status
        : ORDER_STATUS_AR[latestOrder.status] || latestOrder.status;
      const updatedAt = useRequest
        ? (latestRequest.updatedAt || latestRequest.createdAt)
        : (latestOrder.updatedAt || latestOrder.createdAt);
      let updatedText = "";
      try {
        if (updatedAt) updatedText = new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(updatedAt));
      } catch {
        // A malformed legacy timestamp should not hide the current request.
      }
      openLatest = () => {
        if (useRequest) go("requestDetail", { requestId: latestRequest.id }, { title: "تفاصيل الطلب", tab: "requests" });
        else go("orderDetail", { orderId: latestOrder.id }, { title: "تفاصيل الطلب", tab: "requests" });
      };
      cards.push(`
        <button class="last-order-card" id="lastOrderBtn">
          <div class="last-order-icon">${icon("requests", { size: 22 })}</div>
          <div class="last-order-body">
            <small>آخر طلب</small>
            <strong>${esc(title)}</strong>
            <span class="last-order-meta"><span class="status-pill">${esc(statusText)}</span>${updatedText ? `<time datetime="${esc(updatedAt)}">آخر تحديث ${esc(updatedText)}</time>` : ""}</span>
          </div>
          <span class="chevron">${icon("chevron-start", { size: 18 })}</span>
        </button>`);
    }

    const unread = (notificationsRes.data || []).filter((n) => !n.readAt);
    if (unread.length) {
      bodyEl.querySelector("#homeBellDot").hidden = false;
      cards.push(`
        <button class="last-order-card activity-notification" id="latestNotificationBtn">
          <div class="last-order-icon activity-bell">${icon("bell", { size: 22 })}<span class="unread-dot"></span></div>
          <div class="last-order-body">
            <small>${unread.length === 1 ? "إشعار جديد" : `${unread.length} إشعارات جديدة`}</small>
            <strong>${esc(unread[0].title)}</strong>
            <p>${esc(unread[0].message)}</p>
          </div>
          <span class="chevron">${icon("chevron-start", { size: 18 })}</span>
        </button>`);
    }

    if (!cards.length) return;
    const title = bodyEl.querySelector("#activityTitle");
    if (title) title.textContent = hasCurrentRequest ? "طلبك الحالي" : "تنبيهاتك";
    list.innerHTML = cards.join("");
    stagger(list);
    section.hidden = false;
    bodyEl.querySelector("#lastOrderBtn")?.addEventListener("click", () => openLatest?.());
    bodyEl.querySelector("#latestNotificationBtn")?.addEventListener("click", () => go("notifications", {}, { title: "الإشعارات", tab: "home" }));
  } catch {
    // Activity is a convenience: never block the rest of Home on it.
  }
}

// A fixed-price request whose payment step was left unfinished (app closed or
// restarted): one tap goes back to it. The request already exists.
function showPendingPayment(mount) {
  const pending = readPendingPayment(localStorage);
  if (!mount || !pending) return;
  mount.innerHTML = `
    <button type="button" class="pending-payment-card detail-block" id="resumePaymentBtn">
      ${icon("wallet", { size: 20 })}
      <span><b>طلب بانتظار الدفع</b><small>${esc(pending.serviceName || "")} · أكمل الدفع ورفع إشعار التحويل</small></span>
    </button>`;
  mount.querySelector("#resumePaymentBtn").addEventListener("click", () => {
    go("requestPayment", { ...pending, resumed: true }, { title: "الدفع" });
  });
}
