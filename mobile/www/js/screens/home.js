import { api } from "../api.js";
import { esc, skeletonGrid } from "../ui.js";
import { icon, iconForService } from "../icons.js";
import { getCustomer, isAccountUnlocked } from "../auth.js";
import { loadCatalog, loadHomepage } from "../catalog.js";
import { go, goToTab } from "../router.js";
import { openServiceById, openServiceItem, VISAS_HUB_CODE } from "./services.js";
import { homeBentoTiles, publishedServiceCount, serviceCountText, hubVisaTypes, homeFeaturedServices, startingPrice, priceText, sdgText, durationOf } from "../service-view.js";
import { firstName, greeting, buildBannerSlides, nextSlide, readPendingPayment } from "../experience-core.js";
import { prefersReducedMotion, stagger, watchSnapIndex, scrollToSlide, tapFeedback } from "../motion.js";
import { loadAgency, whatsappLink } from "../agency.js";

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

const AUTOPLAY_MS = 5500;

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
    <div class="hc-search-wrap">
      <button class="hc-search" id="startNowBtn">${icon("search", { size: 19 })}<span>ابحث عن خدمة أو ابدأ طلبك</span></button>
    </div>

    <div id="pendingPaymentMount"></div>

    <section class="hc-bento-wrap" aria-label="خدمات الوكالة">
      <div class="hc-bento" id="homeBento">${skeletonGrid(4)}</div>
    </section>

    <section class="section home-journey" aria-label="كيف يعمل طلبك">
      <div class="section-head"><h2>كيف يعمل طلبك</h2></div>
      <ol class="home-journey-grid">
        <li><span>١</span><strong>اختر الخدمة</strong></li>
        <li><span>٢</span><strong>بياناتك ومستنداتك</strong></li>
        <li><span>٣</span><strong>الدفع وإشعار التحويل</strong></li>
        <li><span>٤</span><strong>تابع الطلب</strong></li>
      </ol>
    </section>

    <section class="section">
      <button class="track-card" id="homeTrackBtn">
        <span class="track-card-icon">${icon("requests", { size: 22 })}</span>
        <span class="track-card-body"><b>تتبع الطلب</b><small>${signedIn ? "تابع حالة طلباتك وسعرها ودفعها" : "برقم هاتفك ورمز تحقق عبر واتساب، دون حساب"}</small></span>
        ${icon("chevron-start", { size: 18 })}
      </button>
    </section>



    <section class="home-banner" aria-roledescription="شرائح العروض" aria-label="إعلانات نسائم الحرمين">
      <div class="banner-track" id="bannerTrack"><div class="banner-slide skeleton-banner"></div></div>
      <div class="banner-dots" id="bannerDots"></div>
    </section>

    <section class="section" id="featuredSection" hidden>
      <div class="section-head">
        <h2>خدمات مختارة</h2>
        <button class="link-btn" id="seeAllServices">عرض الكل</button>
      </div>
      <p class="field-hint stale-note" id="catalogStale" hidden>${icon("wifi-off", { size: 14 })} تعذر تحديث الخدمات الآن؛ المعروض آخر نسخة محفوظة وقد لا تكون محدثة.</p>
      <div id="featuredList" class="featured-list"></div>
    </section>

    <section class="section" id="activitySection" hidden>
      <div class="section-head"><h2>نشاطك</h2></div>
      <div class="activity-list" id="activityList"></div>
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

  const allServices = () => goToTab("services", "services", { title: "الخدمات" });
  bodyEl.querySelector("#seeAllServices").addEventListener("click", allServices);
  bodyEl.querySelector("#startNowBtn").addEventListener("click", () => {
    tapFeedback();
    goToTab("services", "services", { title: "الخدمات" });
  });
  bodyEl.querySelector("#homeBell")?.addEventListener("click", () => {
    tapFeedback();
    go("notifications", {}, { title: "الإشعارات", tab: "home" });
  });
  bodyEl.querySelector("#homeTrackBtn")?.addEventListener("click", () => goToTab("requests", "requests", { title: "طلباتي" }));

  const stopBanner = mountBanner(bodyEl, { signedIn });
  loadCatalogSection(bodyEl, { allServices });
  if (signedIn) loadActivitySection(bodyEl);
  loadAgency().then((agency) => {
    const strip = bodyEl.querySelector("#helpStrip");
    if (strip) strip.href = whatsappLink(agency.whatsapp, "السلام عليكم، أحتاج مساعدة في طلبي");
  });

  return { cleanup: () => stopBanner() };
}

// Banner carousel: only content the agency published (homepage hero and
// sections) and coupons available to this customer; a brand slide otherwise.
// Swipe works natively (scroll-snap, RTL-aware); auto-advance pauses while
// the customer touches it, when the app is in the background, and is off
// entirely under reduced motion.
function mountBanner(bodyEl, { signedIn }) {
  const track = bodyEl.querySelector("#bannerTrack");
  const dotsEl = bodyEl.querySelector("#bannerDots");
  let timer = 0;
  let resumeTimer = 0;
  let stopWatch = () => {};
  let index = 0;
  let count = 0;
  let disposed = false;

  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    stop();
    if (disposed || count < 2 || prefersReducedMotion() || document.hidden) return;
    timer = setInterval(() => scrollToSlide(track, nextSlide(index, count)), AUTOPLAY_MS);
  };
  const pause = () => {
    stop();
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(start, AUTOPLAY_MS);
  };
  const onVisibility = () => (document.hidden ? stop() : start());

  (async () => {
    const [homepage, couponsRes] = await Promise.all([
      loadHomepage().catch(() => ({ hero: null, sections: [] })),
      // Coupons are personal: only for a verified account, never for guests.
      signedIn ? api("/customer/coupons").catch(() => ({ data: { available: [] } })) : Promise.resolve({ data: { available: [] } }),
    ]);
    if (disposed) return;
    const slides = buildBannerSlides({ hero: homepage.hero, sections: homepage.sections || [], coupons: couponsRes.data?.available || [] });
    count = slides.length;
    track.innerHTML = slides.map((slide, i) => `
      <article class="banner-slide banner-${slide.kind}" role="group" aria-roledescription="شريحة" aria-label="${i + 1} من ${slides.length}">
        <div class="banner-copy">
          <span class="banner-eyebrow">${esc(slide.eyebrow)}</span>
          <strong>${esc(slide.title)}</strong>
          ${slide.text ? `<p>${esc(slide.text)}</p>` : ""}
          ${slide.action ? `<span class="banner-action">${esc(slide.action)}</span>` : ""}
        </div>
        <span class="banner-icon" aria-hidden="true">${icon(slide.icon && slide.kind !== "hero" ? slide.icon : "plane", { size: 30 })}</span>
      </article>`).join("");
    dotsEl.innerHTML = count > 1 ? slides.map((_, i) => `<span class="banner-dot" data-i="${i}"></span>`).join("") : "";
    const dots = [...dotsEl.children];
    stopWatch = watchSnapIndex(track, (i) => {
      index = i;
      dots.forEach((dot, d) => dot.classList.toggle("active", d === i));
    });
    track.addEventListener("pointerdown", pause, { passive: true });
    track.addEventListener("touchstart", pause, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    start();
  })();

  return () => {
    disposed = true;
    stop();
    clearTimeout(resumeTimer);
    stopWatch();
    document.removeEventListener("visibilitychange", onVisibility);
  };
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

function featuredRow(item) {
  const price = startingPrice(item);
  const duration = durationOf(item);
  return `
    <button class="featured-row" data-id="${esc(item.id)}">
      <span class="featured-icon">${icon(iconForService(item), { size: 22 })}</span>
      <span class="featured-body">
        <b>${esc(item.name)}</b>
        <small>${[price ? `من <bdi>${esc(priceText(price))}</bdi>` : "", sdgText(price) ? `<bdi>${esc(sdgText(price))}</bdi>` : "", duration ? esc(duration) : ""].filter(Boolean).join(" · ")}</small>
      </span>
      ${icon("chevron-start", { size: 16 })}
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
    <div class="hc-tile hc-tile-feature">
      <span class="hc-tile-icon">${icon("umrah", { size: 24 })}</span>
      <span class="hc-feature-copy"><strong>خدمات العمرة</strong><small>تأشيرة فقط أو عمرة مع خدمات بالطيران أو البحر</small></span>
      <button type="button" class="hc-feature-cta" id="homeUmrahBtn">اطلب الخدمة ${icon("chevron-start", { size: 18 })}</button>
    </div>`;
}

async function loadCatalogSection(bodyEl, { allServices }) {
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
    const visaCount = hubVisaTypes(catalog).length;
    const total = publishedServiceCount(catalog);
    bento.innerHTML = [
      umrah ? umrahTile() : "",
      ...shortcuts.map((shortcut) => shortcut.hub
        ? `<button type="button" class="hc-tile hc-tile-wide" data-key="visas">
            <span class="hc-tile-icon">${icon("visa", { size: 22 })}</span>
            <span class="hc-tile-label">التأشيرات والموافقات<small>${esc(serviceCountText(visaCount))}</small></span>
            ${icon("chevron-start", { size: 18 })}
          </button>`
        : bentoTile(shortcut)),
      total ? `<button type="button" class="hc-tile hc-tile-all" id="allServicesFromHome">
          <span class="hc-tile-icon">${icon("grid", { size: 22 })}</span>
          <span class="hc-tile-label">كل الخدمات (<bdi>${total}</bdi>)</span>
        </button>` : "",
    ].join("");
    stagger(bento);
    bento.querySelector("#homeUmrahBtn")?.addEventListener("click", () => { tapFeedback(); openServiceItem(umrah); });
    bento.querySelector("#allServicesFromHome")?.addEventListener("click", () => { tapFeedback(); allServices(); });
    bento.querySelectorAll(".hc-tile[data-key]").forEach((button) => {
      button.addEventListener("click", () => {
        tapFeedback();
        const shortcut = shortcuts.find((candidate) => candidate.key === button.dataset.key);
        if (shortcut?.hub) openServiceById(VISAS_HUB_CODE, catalog);
        else if (shortcut?.item) openServiceItem(shortcut.item);
      });
    });

    // Services with a price the agency announced, straight from the catalog
    // (the back-office price and rate); none are listed when none are priced.
    const featured = homeFeaturedServices(catalog, shortcuts);
    const section = bodyEl.querySelector("#featuredSection");
    if (featured.length) {
      bodyEl.querySelector("#featuredList").innerHTML = featured.map(featuredRow).join("");
      bodyEl.querySelectorAll(".featured-row").forEach((row) => {
        row.addEventListener("click", () => {
          const item = [...catalog.services, ...catalog.visaTypes].find((candidate) => candidate.id === row.dataset.id);
          if (item) openServiceItem(item);
        });
      });
      section.hidden = false;
    } else {
      section.hidden = !catalog.stale;
    }
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

    const latestOrder = overviewRes.data?.recentOrders?.[0] || null;
    const latestRequest = requestsRes.data?.[0] || null;
    const orderTime = latestOrder ? new Date(latestOrder.updatedAt || latestOrder.createdAt).getTime() : -1;
    const requestTime = latestRequest ? new Date(latestRequest.updatedAt || latestRequest.createdAt).getTime() : -1;
    let openLatest = null;

    if (orderTime >= 0 || requestTime >= 0) {
      const useRequest = requestTime >= orderTime;
      const title = useRequest
        ? (latestRequest.service?.name || latestRequest.visaType?.name || "طلب خدمة")
        : (latestOrder.items?.[0]?.service?.name || latestOrder.orderNumber);
      const statusText = useRequest
        ? (latestRequest.status === "CLOSED" && latestRequest.outcome ? REQUEST_OUTCOME_AR[latestRequest.outcome] : REQUEST_STATUS_AR[latestRequest.status]) || latestRequest.status
        : ORDER_STATUS_AR[latestOrder.status] || latestOrder.status;
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
            <span class="status-pill">${esc(statusText)}</span>
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
