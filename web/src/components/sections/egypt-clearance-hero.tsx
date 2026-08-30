import Link from "next/link";
import {
  ChevronLeft,
  CircleCheck,
  FileCheck2,
  MapPin,
  Plane,
  ShieldCheck,
} from "lucide-react";
import { Container } from "@/components/container";
import { FadeIn } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";

function EgyptFlagAccent() {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-8 flex-col overflow-hidden rounded-sm border border-white/25 shadow-sm"
    >
      <span className="h-1/3 bg-[#ce1126]" />
      <span className="h-1/3 bg-white" />
      <span className="h-1/3 bg-[#171717]" />
    </span>
  );
}

export function EgyptClearanceHero({
  title,
  description,
  priceLabel,
  priceSubLabel,
  isAccepting,
  heroImageUrl,
  heroImageMobileUrl,
  motionEnabled = false,
  motionVideoUrl,
}: {
  title: string;
  description: string;
  /** Either the formatted published price or the safe fallback when no approved price is published. */
  priceLabel: string;
  priceSubLabel?: string | null;
  /** True only when this VisaType came back from the active public catalog. */
  isAccepting: boolean;
  /** Admin-uploaded hero background (Service.heroImageKey); falls back to the bundled illustration when unset. */
  heroImageUrl?: string | null;
  /** Admin-uploaded mobile-specific override; falls back to heroImageUrl, then the bundled illustration. */
  heroImageMobileUrl?: string | null;
  /** Service.motionEnabled — gates the decorative motion entirely (video clip if uploaded, else the built-in CSS animation). */
  motionEnabled?: boolean;
  /** Admin-uploaded motion clip (Service.motionVideoKey); when unset, motionEnabled just runs the built-in plane animation. */
  motionVideoUrl?: string | null;
}) {
  const DEFAULT_HERO_IMAGE = "/images/egypt-security-approval-hero.svg";
  const desktopImage = heroImageUrl || DEFAULT_HERO_IMAGE;
  const mobileImage = heroImageMobileUrl || desktopImage;

  return (
    <section className="relative isolate min-h-[680px] overflow-hidden bg-[#071d45] text-white sm:min-h-[720px] lg:min-h-[650px]">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-[position:35%_center] sm:hidden"
        style={{ backgroundImage: `url('${mobileImage}')` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden bg-cover sm:block sm:bg-center lg:bg-[position:left_center]"
        style={{ backgroundImage: `url('${desktopImage}')` }}
      />
      {motionEnabled && motionVideoUrl ? (
        <video
          aria-hidden
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 hidden size-full object-cover sm:block motion-reduce:hidden"
          src={motionVideoUrl}
        />
      ) : null}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-[#061b42]/35 via-[#071d45]/58 to-[#061a3e]/95 lg:bg-gradient-to-l lg:from-[#061b42]/95 lg:via-[#071d45]/72 lg:to-[#071d45]/14"
      />
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#ce1126] via-white to-[#171717]" />

      {/* Sudan → Egypt departing-plane motif: pure CSS animation (no
          video/Lottie asset), disabled for prefers-reduced-motion via
          Tailwind's motion-reduce: variant, which leaves the plane as a
          static icon instead of removing it entirely. Only rendered when an
          admin has motion enabled for this service, and only as a fallback
          when no motion video clip was uploaded (the video above already
          supplies its own motion). */}
      {motionEnabled && !motionVideoUrl ? (
        <Plane
          aria-hidden
          className="pointer-events-none absolute end-[18%] top-[38%] hidden size-6 -rotate-45 text-white/60 sm:block motion-reduce:animate-none animate-fly-route"
        />
      ) : null}

      <Container className="relative flex min-h-[680px] items-center py-14 sm:min-h-[720px] sm:py-16 lg:min-h-[650px]">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
          <FadeIn className="order-2 lg:order-1">
            <div className="mx-auto max-w-xl rounded-[2rem] border border-white/15 bg-[#071d45]/74 p-5 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-7 lg:mx-0">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <MapPin className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-white/60">وجهتك</p>
                  <p className="mt-0.5 text-sm font-bold">جمهورية مصر العربية</p>
                </div>
                <EgyptFlagAccent />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-accent/25 bg-accent/10 p-4">
                  <p className="text-xs font-medium text-white/60">التكلفة</p>
                  <p className="mt-1 text-base font-extrabold text-accent">{priceLabel}</p>
                  {priceSubLabel ? <p className="mt-1 text-xs leading-relaxed text-white/60">{priceSubLabel}</p> : null}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <p className="text-xs font-medium text-white/60">حالة الخدمة</p>
                  {isAccepting ? (
                    <p className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-emerald-300">
                      <CircleCheck className="size-4" />
                      متاحة للتقديم
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-white/70">غير متاحة حاليًا</p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 text-xs text-white/72 sm:grid-cols-3">
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-3">
                  <FileCheck2 className="size-4 shrink-0 text-accent" />
                  تقديم إلكتروني
                </span>
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-3">
                  <ShieldCheck className="size-4 shrink-0 text-accent" />
                  مستنداتك محمية
                </span>
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-3">
                  <Plane className="size-4 shrink-0 text-accent" />
                  متابعة حتى النتيجة
                </span>
              </div>
            </div>
          </FadeIn>

          <FadeIn className="order-1 text-center lg:order-2 lg:text-start">
            <nav
              aria-label="مسار التصفح"
              className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-white/65 lg:justify-start"
            >
              <Link href="/" className="transition hover:text-white">الرئيسية</Link>
              <ChevronLeft className="size-3.5" />
              <Link href="/visas" className="transition hover:text-white">التأشيرات</Link>
              <ChevronLeft className="size-3.5" />
              <span className="text-white/90">الموافقة الأمنية لمصر</span>
            </nav>

            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/45 bg-[#071d45]/55 px-4 py-2 text-xs font-bold text-accent backdrop-blur-sm">
              <EgyptFlagAccent />
              خدمة السفر إلى مصر
            </span>

            <h1 className="mt-5 text-balance text-4xl font-black leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.65rem]">
              {title}
            </h1>
            <p className="mt-3 text-xl font-extrabold text-accent sm:text-2xl">للسفر إلى مصر</p>
            <p className="mx-auto mt-5 max-w-xl text-balance text-sm leading-8 text-white/80 sm:text-base lg:mx-0">
              {description}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild variant="gold" size="lg" className="min-w-44 shadow-lg shadow-black/15">
                <a href="#book">ابدأ طلب الموافقة</a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="min-w-40 border-white/35 bg-[#071d45]/25 text-white backdrop-blur-sm hover:border-white hover:bg-white/10"
              >
                <Link href="/track">تتبع طلبك</Link>
              </Button>
            </div>

            <p className="mx-auto mt-6 max-w-xl text-balance text-[11px] leading-6 text-white/55 lg:mx-0">
              نسائم الحرمين وكالة سفر وسياحة تقدم خدمة متابعة إجراءات طلب الموافقة الأمنية، وليست جهة إصدار حكومية.
            </p>
          </FadeIn>
        </div>
      </Container>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#071d45]/45 to-transparent"
      />
    </section>
  );
}
