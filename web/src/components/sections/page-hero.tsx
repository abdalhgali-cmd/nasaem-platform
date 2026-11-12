import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/container";
import { FadeIn } from "@/components/motion/fade-in";

export function PageHero({
  eyebrow,
  title,
  description,
  breadcrumb,
  imageUrl,
  mobileImageUrl,
  motionEnabled = false,
  motionVideoUrl,
}: {
  eyebrow: string;
  title: string;
  description: string;
  breadcrumb: string;
  /** Admin-uploaded hero background (Service.heroImageKey) for pages backed by a service — omit to keep the plain gradient background every other PageHero caller uses. */
  imageUrl?: string | null;
  /** Admin-uploaded mobile-specific override; falls back to imageUrl. */
  mobileImageUrl?: string | null;
  /** Service.motionEnabled — only takes effect together with motionVideoUrl; this generic hero has no built-in CSS animation to fall back to. */
  motionEnabled?: boolean;
  motionVideoUrl?: string | null;
}) {
  const desktopImage = imageUrl || null;
  const mobileImage = mobileImageUrl || desktopImage;

  return (
    <section className="bg-brand-navy relative isolate overflow-hidden py-14 text-white sm:py-20">
      {mobileImage ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center sm:hidden"
          style={{ backgroundImage: `url('${mobileImage}')` }}
        />
      ) : null}
      {desktopImage ? (
        <div
          aria-hidden
          className="absolute inset-0 hidden bg-cover bg-center sm:block"
          style={{ backgroundImage: `url('${desktopImage}')` }}
        />
      ) : null}
      {desktopImage ? (
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy/85 to-navy-soft/90" />
      ) : null}
      {motionEnabled && motionVideoUrl ? (
        <video
          aria-hidden
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 hidden size-full object-cover sm:motion-safe:block"
          src={motionVideoUrl}
        />
      ) : null}
      <div aria-hidden className="bg-brand-dots absolute inset-0" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-accent/50 to-transparent" />
      <Container className="relative">
        <FadeIn>
          <nav aria-label="مسار التصفح" className="flex items-center gap-1.5 text-xs font-semibold text-white/60">
            <Link href="/" className="hover:text-white">الرئيسية</Link>
            <ChevronLeft className="size-3.5" />
            <span className="text-white/90">{breadcrumb}</span>
          </nav>

          <p className="mt-7 inline-flex items-center gap-2.5 text-[0.8125rem] font-extrabold text-accent">
            <span aria-hidden className="h-0.5 w-7 rounded-full bg-accent" />
            {eyebrow}
          </p>
          <h1 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold leading-snug sm:text-4xl lg:text-[2.75rem]">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-white/75 sm:text-base">
            {description}
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}
