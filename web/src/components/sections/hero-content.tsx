"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type HeroContentProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  defaultTitleNode: ReactNode;
  defaultDescription: string;
  /** The agency's own logo for dark surfaces (admin upload, else /logo-dark.png). */
  logoUrl: string;
};

// A short, gentle rise; MotionConfig reducedMotion="user" turns every
// transform off for visitors who ask for reduced motion (opacity only).
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
});

// Client component so the framer-motion entrance animations survive —
// Hero itself (the parent) is a server component that fetches admin
// content, and passes the resolved (or default) values down here.
export function HeroContent({ title, description, ctaLabel, ctaTarget, defaultTitleNode, defaultDescription, logoUrl }: HeroContentProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-start">
          <motion.h1
            {...rise(0.08)}
            className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.15] sm:text-5xl lg:text-[3.5rem]"
          >
            {title || defaultTitleNode}
          </motion.h1>

          <motion.p
            {...rise(0.16)}
            className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-white/80 sm:text-lg"
          >
            {description || defaultDescription}
          </motion.p>

          <motion.div {...rise(0.24)} className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Button asChild variant="gold" size="lg" className="shadow-lg shadow-accent/20">
              <Link href={!ctaTarget || ctaTarget === "#start-request" ? "#services" : ctaTarget}>
                {ctaLabel || "ابدأ طلبك"}
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="text-white/85 hover:bg-white/10 hover:text-white">
              <Link href="/track">تتبع طلبك</Link>
            </Button>
          </motion.div>

        </div>

        <HeroEmblem logoUrl={logoUrl} />
      </div>

    </MotionConfig>
  );
}

// The agency's official logo on a glass disc, circled by a slowly turning
// gold ring (CSS only; still for prefers-reduced-motion). Decorative: the
// page heading carries the meaning, so the image alt stays the brand name.
function HeroEmblem({ logoUrl }: { logoUrl: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto aspect-square w-28 sm:w-40 lg:w-full lg:max-w-[26rem]"
      data-testid="hero-emblem"
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-full bg-[conic-gradient(from_90deg,transparent_0deg,rgba(212,175,55,0.85)_60deg,transparent_140deg,transparent_220deg,rgba(255,255,255,0.35)_270deg,transparent_330deg)] p-[2px] motion-safe:animate-[spin_28s_linear_infinite]"
      >
        <div className="size-full rounded-full bg-[#0a2f70]" />
      </div>
      <div aria-hidden className="absolute inset-[7%] rounded-full border border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-md" />
      <div aria-hidden className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.22),transparent_70%)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin-replaceable backend asset or the bundled logo; same reasoning as logo.tsx. */}
        <img
          src={logoUrl}
          alt="نسائم الحرمين للسفر والسياحة"
          width={1536}
          height={1024}
          fetchPriority="high"
          className="h-auto w-[78%] object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
        />
      </div>
    </motion.div>
  );
}
