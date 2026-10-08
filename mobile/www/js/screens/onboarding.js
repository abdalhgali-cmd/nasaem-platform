// First-launch introduction (3 slides). Shown once per install before the
// login/register choice; replayable from Account. It never touches the
// customer session: completion is stored separately (experience-core.js
// ONBOARDING_KEY) and returning customers never see it at launch.
import { esc } from "../ui.js";
import { icon } from "../icons.js";
import { AGENCY, AGENCY_SERVICES } from "../agency.js";
import { getItem, setItem, removeItem } from "../storage.js";
import { ONBOARDING_KEY } from "../experience-core.js";
import { watchSnapIndex, scrollToSlide, tapFeedback } from "../motion.js";

export async function isOnboardingDone() {
  try {
    return (await getItem(ONBOARDING_KEY)) === "done";
  } catch {
    return true; // storage unavailable: never block the app on the intro
  }
}

export async function markOnboardingDone() {
  try {
    await setItem(ONBOARDING_KEY, "done");
  } catch {
    // Non-fatal: worst case the intro shows once more.
  }
}

export async function resetOnboarding() {
  try {
    await removeItem(ONBOARDING_KEY);
  } catch {
    // ignore
  }
}

const JOURNEY_STEPS = [
  { icon: "search", text: "اختر الخدمة التي تحتاجها" },
  { icon: "document", text: "أرسل طلبك بخطوات واضحة" },
  { icon: "upload", text: "ارفع مستنداتك بأمان من هاتفك" },
  { icon: "requests", text: "تابع حالة طلبك خطوة بخطوة" },
  { icon: "bell", text: "تصلك الإشعارات والتحديثات أولًا بأول" },
];

function welcomeArt() {
  // Lightweight SVG: a dashed flight path that draws in, a plane orbiting
  // the official logo, a few gold stars. Transform/opacity animations only.
  return `
    <div class="ob-art ob-art-welcome" aria-hidden="true">
      <svg class="ob-path" viewBox="0 0 320 220" fill="none">
        <path d="M14 178 C 90 60, 230 40, 306 120" stroke="rgba(214,170,75,.55)" stroke-width="2" stroke-dasharray="6 8" stroke-linecap="round" pathLength="600"/>
        <circle cx="40" cy="40" r="2" fill="#d6aa4b"/><circle cx="282" cy="34" r="1.6" fill="#fff" opacity=".7"/>
        <circle cx="262" cy="190" r="2.2" fill="#d6aa4b" opacity=".8"/><circle cx="70" cy="196" r="1.4" fill="#fff" opacity=".6"/>
      </svg>
      <div class="ob-logo-wrap float-y">
        <div class="ob-orbit"><span class="orbit-plane">${icon("plane", { size: 22 })}</span></div>
        <img src="assets/brand/logo-mark.png" alt="" width="112" height="112" class="ob-logo">
      </div>
    </div>`;
}

function servicesArt() {
  return `
    <div class="ob-services" role="list">
      ${AGENCY_SERVICES.map((service) => `
        <div class="ob-service" role="listitem">
          <span class="ob-service-icon">${icon(service.icon, { size: 24 })}</span>
          <span>${esc(service.label)}</span>
        </div>`).join("")}
    </div>`;
}

function journeyArt() {
  return `
    <ol class="ob-steps">
      ${JOURNEY_STEPS.map((step, i) => `
        <li class="ob-step">
          <span class="ob-step-icon">${icon(step.icon, { size: 20 })}</span>
          <span class="ob-step-text">${esc(step.text)}</span>
          <span class="ob-step-no" aria-hidden="true">${i + 1}</span>
        </li>`).join("")}
    </ol>`;
}

const SLIDES = [
  { id: "welcome", title: "مرحباً بك في نسائم الحرمين", subtitle: AGENCY.tagline, text: "وكالة سفر وسياحة لخدمات العمرة والتأشيرات وحجوزات الطيران والفنادق.", art: welcomeArt },
  { id: "services", title: "كل خدمات سفرك في مكان واحد", subtitle: "", text: "اختر خدمتك وقدّم طلبك من التطبيق مباشرة.", art: servicesArt },
  { id: "journey", title: "تابع رحلتك بكل سهولة", subtitle: "", text: "من اختيار الخدمة حتى التسليم، تبقى على اطلاع بكل خطوة.", art: journeyArt },
];

/**
 * params.onFinish(): called once when the customer skips or taps ابدأ الآن.
 * params.replay: shown again from Account (finish returns there).
 */
export function renderOnboardingScreen({ bodyEl, params = {} }) {
  bodyEl.innerHTML = `
    <section id="onboarding" class="onboarding" aria-roledescription="عرض تعريفي" aria-label="تعرّف على نسائم الحرمين">
      <header class="ob-top">
        <span class="ob-brand">${esc(AGENCY.shortName)}</span>
        <button type="button" class="ob-skip" id="onboardingSkip">تخطي</button>
      </header>
      <div class="ob-track" id="onboardingTrack" tabindex="0">
        ${SLIDES.map((slide, i) => `
          <article class="ob-slide ob-slide-${slide.id}" role="group" aria-roledescription="شريحة" aria-label="${i + 1} من ${SLIDES.length}">
            <div class="ob-visual">${slide.art()}</div>
            <div class="ob-copy">
              <h2>${esc(slide.title)}</h2>
              ${slide.subtitle ? `<p class="ob-subtitle">${esc(slide.subtitle)}</p>` : ""}
              ${slide.text ? `<p class="ob-text">${esc(slide.text)}</p>` : ""}
            </div>
          </article>`).join("")}
      </div>
      <footer class="ob-controls">
        <div class="ob-dots" role="tablist" aria-label="الشرائح">
          ${SLIDES.map((_, i) => `<button type="button" class="ob-dot" role="tab" data-index="${i}" aria-label="الشريحة ${i + 1}"></button>`).join("")}
        </div>
        <button type="button" class="primary ob-next" id="onboardingNext">التالي</button>
        <button type="button" class="primary ob-start" id="onboardingStart" hidden>ابدأ الآن</button>
      </footer>
    </section>`;

  const root = bodyEl.querySelector("#onboarding");
  const track = bodyEl.querySelector("#onboardingTrack");
  const slides = [...track.children];
  const dots = [...bodyEl.querySelectorAll(".ob-dot")];
  const nextBtn = bodyEl.querySelector("#onboardingNext");
  const startBtn = bodyEl.querySelector("#onboardingStart");
  let current = 0;
  let finished = false;

  const finish = async () => {
    if (finished) return;
    finished = true;
    tapFeedback();
    await markOnboardingDone();
    params.onFinish?.();
  };

  const setActive = (index) => {
    current = index;
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
      slide.setAttribute("aria-hidden", i === index ? "false" : "true");
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
      dot.setAttribute("aria-selected", i === index ? "true" : "false");
    });
    const last = index === slides.length - 1;
    nextBtn.hidden = last;
    startBtn.hidden = !last;
    root.dataset.slide = String(index);
  };

  const goTo = (index) => scrollToSlide(track, Math.max(0, Math.min(slides.length - 1, index)));

  const stopWatching = watchSnapIndex(track, setActive);
  setActive(0);

  nextBtn.addEventListener("click", () => {
    tapFeedback();
    goTo(current + 1);
  });
  startBtn.addEventListener("click", finish);
  bodyEl.querySelector("#onboardingSkip").addEventListener("click", finish);
  dots.forEach((dot) => dot.addEventListener("click", () => goTo(Number(dot.dataset.index))));
  // Keyboard / D-pad: in RTL the "next" slide is to the left.
  track.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") goTo(current + 1);
    if (event.key === "ArrowRight") goTo(current - 1);
  });

  return { cleanup: stopWatching };
}
