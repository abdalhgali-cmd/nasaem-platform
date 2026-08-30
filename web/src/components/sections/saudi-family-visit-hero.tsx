import Link from "next/link";
import {
  CircleCheck,
  ChevronLeft,
  FileCheck2,
  Heart,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { Container } from "@/components/container";
import { FadeIn } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";

// Same restrained-identity approach as EgyptClearanceHero: one hero
// illustration (stylized, non-specific desert/family/travel-document
// scene — see /public/images/saudi-family-visit-hero.svg) plus Saudi
// green as a color cue only. No flag composition, no religious script, no
// government emblem.
function SaudiAccentSwatch() {
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-8 flex-col overflow-hidden rounded-sm border border-white/25 shadow-sm"
    >
      <span className="h-1/2 bg-[#006C35]" />
      <span className="h-1/2 bg-white" />
    </span>
  );
}

export function SaudiFamilyVisitHero({
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
  /** Service.motionEnabled — this hero has no built-in CSS animation, so motion only shows up once an admin has both enabled it and uploaded a clip. */
  motionEnabled?: boolean;
  /** Admin-uploaded motion clip (Service.motionVideoKey). */
  motionVideoUrl?: string | null;
}) {
  const DEFAULT_HERO_IMAGE = "/images/saudi-family-visit-hero.svg";
  const desktopImage = heroImageUrl || DEFAULT_HERO_IMAGE;
  const mobileImage = heroImageMobileUrl || desktopImage;

  return (
    <section className="relative isolate min-h-[680px] overflow-hidden bg-[#0b3d24] text-white sm:min-h-[720px] lg:min-h-[650px]">
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
        className="absolute inset-0 bg-gradient-to-b from-[#092e1c]/35 via-[#0b3d24]/58 to-[#092e1c]/95 lg:bg-gradient-to-l lg:from-[#092e1c]/95 lg:via-[#0b3d24]/72 lg:to-[#0b3d24]/14"
      />
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#006C35] via-white to-[#006C35]" />

      <Container className="relative flex min-h-[680px] items-center py-14 sm:min-h-[720px] sm:py-16 lg:min-h-[650px]">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
          <FadeIn className="order-2 lg:order-1">
            <div className="mx-auto max-w-xl rounded-[2rem] border border-white/15 bg-[#0b3d24]/74 p-5 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-7 lg:mx-0">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                  <MapPin className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-white/60">وجهتك</p>
                  <p className="mt-0.5 text-sm font-bold">المملكة العربية السعودية</p>
                </div>
                <SaudiAccentSwatch />
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
                  <Heart className="size-4 shrink-0 text-accent" />
                  لكل أفراد العائلة
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
              <span className="text-white/90">الزيارة العائلية</span>
            </nav>

            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/45 bg-[#0b3d24]/55 px-4 py-2 text-xs font-bold text-accent backdrop-blur-sm">
              <SaudiAccentSwatch />
              خدمة الزيارة العائلية للسعودية
            </span>

            <h1 className="mt-5 text-balance text-4xl font-black leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.65rem]">
              {title}
            </h1>
            <p className="mt-3 text-xl font-extrabold text-accent sm:text-2xl">للسفر إلى السعودية</p>
            <p className="mx-auto mt-5 max-w-xl text-balance text-sm leading-8 text-white/80 sm:text-base lg:mx-0">
              {description}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild variant="gold" size="lg" className="min-w-44 shadow-lg shadow-black/15">
                <a href="#book">ابدأ طلب الزيارة</a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="min-w-40 border-white/35 bg-[#0b3d24]/25 text-white backdrop-blur-sm hover:border-white hover:bg-white/10"
              >
                <Link href="/track">تتبع طلبك</Link>
              </Button>
            </div>

            <p className="mx-auto mt-6 max-w-xl text-balance text-[11px] leading-6 text-white/55 lg:mx-0">
              نسائم الحرمين وكالة سفر وسياحة تقدم خدمة متابعة إجراءات طلب الزيارة العائلية، وليست جهة إصدار حكومية.
            </p>
          </FadeIn>
        </div>
      </Container>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b3d24]/45 to-transparent"
      />
    </section>
  );
}
