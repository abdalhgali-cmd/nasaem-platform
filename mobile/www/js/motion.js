// Small motion helpers. All movement is CSS (css/motion.css) on transform and
// opacity; JS only adds classes / indices. Everything respects the system
// "reduce motion" setting.

const reduceQuery = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : null;

export function prefersReducedMotion() {
  return Boolean(reduceQuery?.matches);
}

// Staggered entrance: give each direct child of `container` matching
// `selector` an index; css/motion.css delays its `.reveal` animation by it.
export function stagger(container, selector = ":scope > *", { start = 0, max = 10 } = {}) {
  if (!container) return;
  container.querySelectorAll(selector).forEach((el, i) => {
    el.classList.add("reveal");
    el.style.setProperty("--i", String(start + Math.min(i, max)));
  });
}

// A light tick on supported devices (Capacitor Haptics), never required.
const haptics = typeof window !== "undefined" ? window.Capacitor?.Plugins?.Haptics : null;
export function tapFeedback() {
  if (!haptics || prefersReducedMotion()) return;
  haptics.impact({ style: "LIGHT" }).catch(() => {});
}

// Fires `onChange(index)` with the slide closest to the scroller's center.
// Uses one passive scroll listener throttled to animation frames; returns a
// cleanup function so screens never leak listeners.
export function watchSnapIndex(scroller, onChange) {
  let frame = 0;
  let last = -1;
  const measure = () => {
    frame = 0;
    const slides = scroller.children;
    if (!slides.length) return;
    const width = scroller.clientWidth || 1;
    // RTL scrollLeft is 0 at the start and negative going forward in Chromium.
    const index = Math.round(Math.abs(scroller.scrollLeft) / width);
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    if (clamped !== last) {
      last = clamped;
      onChange(clamped);
    }
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  measure();
  return () => {
    scroller.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
  };
}

// Scrolls a horizontal snap scroller to slide `index` (RTL-aware).
export function scrollToSlide(scroller, index) {
  const width = scroller.clientWidth;
  const rtl = getComputedStyle(scroller).direction === "rtl";
  scroller.scrollTo({ left: (rtl ? -1 : 1) * index * width, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
