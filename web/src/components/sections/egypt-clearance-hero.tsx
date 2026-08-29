import Link from "next/link";
import { ChevronLeft, CircleCheck, Stamp } from "lucide-react";
import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
import { FadeIn } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";

// A restrained, abstract nod to Egypt — not a literal postcard illustration
// and never the state's own symbols — kept to exactly two cues so NASAEM's
// own Navy/Gold identity stays dominant:
//   1. a soft triangular "pyramid horizon" silhouette (the same
//      low-opacity, geometric-pattern technique GradientBackdrop already
//      uses elsewhere on the site, not a new "clip-art Egypt" motif)
//   2. a thin red/white/black accent rule — Egypt's flag colors as a color
//      cue only, with no eagle emblem or any government insignia
function EgyptHorizonMotif() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 200"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-accent opacity-[0.08] sm:h-52"
    >
      <path d="M120 200 L230 60 L340 200 Z" fill="currentColor" />
      <path d="M300 200 L430 20 L560 200 Z" fill="currentColor" />
      <path d="M500 200 L610 70 L720 200 Z" fill="currentColor" />
    </svg>
  );
}

export function EgyptClearanceHero({
  title,
  description,
  priceLabel,
  priceSubLabel,
  isAccepting,
}: {
  title: string;
  description: string;
  /** Either the formatted published price (e.g. "1,500 SDG") or the fallback "يتم تحديد التكلفة بعد مراجعة الطلب" copy. */
  priceLabel: string;
  priceSubLabel?: string | null;
  /** True only when this VisaType actually came back from the public (active-only) catalog — never asserted otherwise. */
  isAccepting: boolean;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-primary to-[#0a2f70] pb-20 pt-16 text-white sm:pb-28 sm:pt-20">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#ce1126] via-neutral-100 to-neutral-900"
      />
      <GradientBackdrop variant="dark" />
      <EgyptHorizonMotif />

      <Container className="relative text-center">
        <FadeIn>
          <nav aria-label="مسار التصفح" className="flex items-center justify-center gap-1.5 text-xs text-white/60">
            <Link href="/" className="hover:text-white">الرئيسية</Link>
            <ChevronLeft className="size-3.5" />
            <Link href="/visas" className="hover:text-white">التأشيرات</Link>
            <ChevronLeft className="size-3.5" />
            <span className="text-white/90">الموافقة الأمنية لمصر</span>
          </nav>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-white/5 px-4 py-1.5 text-xs font-bold text-accent backdrop-blur-sm">
            <Stamp className="size-3.5" />
            خدمة الموافقة الأمنية من نسائم الحرمين
          </span>

          <h1 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-sm leading-relaxed text-white/75 sm:text-base">
            {description}
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur-sm">
              {priceLabel}
              {priceSubLabel ? <span className="font-normal text-white/70">— {priceSubLabel}</span> : null}
            </span>
            {isAccepting ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300">
                <CircleCheck className="size-4" />
                نستقبل طلبات هذه الخدمة الآن
              </span>
            ) : null}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild variant="gold" size="lg">
              <a href="#book">ابدأ طلب الموافقة</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/30 text-white hover:border-white hover:bg-white/10">
              <Link href="/track">تتبع طلبك</Link>
            </Button>
          </div>

          <p className="mx-auto mt-6 max-w-lg text-balance text-xs leading-relaxed text-white/55">
            نسائم الحرمين وكالة سفر وسياحة تقدّم خدمة متابعة إجراءات طلب الموافقة الأمنية نيابة عنك —
            وليست جهة إصدار حكومية.
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}
