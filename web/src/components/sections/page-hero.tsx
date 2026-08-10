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
}: {
  eyebrow: string;
  title: string;
  description: string;
  breadcrumb: string;
  imageUrl?: string;
}) {
  return (
    <section
      className={
        imageUrl
          ? "relative isolate overflow-hidden py-20 text-white sm:py-28"
          : "relative isolate overflow-hidden bg-gradient-to-b from-primary to-[#0a2f70] py-20 text-white sm:py-28"
      }
    >
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/80 to-[#0a2f70]/95" />
        </>
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
