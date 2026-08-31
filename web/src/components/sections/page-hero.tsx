import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
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
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-primary to-[#0a2f70] py-20 text-white sm:py-28">
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
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-primary/80 to-[#0a2f70]/90" />
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
      <GradientBackdrop variant="dark" />
      <Container className="relative text-center">
        <FadeIn>
          <nav aria-label="مسار التصفح" className="flex items-center justify-center gap-1.5 text-xs text-white/60">
            <Link href="/" className="hover:text-white">الرئيسية</Link>
            <ChevronLeft className="size-3.5" />
            <span className="text-white/90">{breadcrumb}</span>
          </nav>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-white/5 px-4 py-1.5 text-xs font-bold text-accent backdrop-blur-sm">
            {eyebrow}
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-sm leading-relaxed text-white/75 sm:text-base">
            {description}
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}
