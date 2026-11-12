"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, LayoutGrid, MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingSearchWidget } from "@/components/sections/booking-search-widget";
import type { PublicCatalog } from "@/lib/services";

const trustSignals = ["اختيار الخدمة بوضوح", "المستندات داخل مسار الطلب", "تتبع حالة الطلب"];

type HeroContentProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  whatsapp: string;
  defaultTitleNode: ReactNode;
  defaultDescription: string;
  catalog: PublicCatalog;
};

// A short, gentle rise; MotionConfig reducedMotion="user" turns every
// transform off for visitors who ask for reduced motion (opacity only).
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
});

// Client component so the framer-motion entrance animations survive —
// Hero itself (the parent) is a server component that fetches admin
// content, and passes the resolved (or default) values down here.
//
// Two columns on large screens: the message and its two actions on one side,
// the request starter (the thing most visitors came for) on the other. On
// phones the message comes first and the starter follows directly.
export function HeroContent({ title, description, ctaLabel, ctaTarget, whatsapp, defaultTitleNode, defaultDescription, catalog }: HeroContentProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
        <div className="flex flex-col items-start text-start">
          <motion.p
            {...rise(0)}
            className="mb-5 inline-flex items-center gap-2.5 text-[0.8125rem] font-extrabold text-accent"
          >
            <span aria-hidden className="h-0.5 w-7 rounded-full bg-accent" />
            العمرة · التأشيرات · خدمات السفر
          </motion.p>

          <motion.h1
            {...rise(0.06)}
            className="max-w-2xl text-balance text-[2.125rem] font-extrabold leading-[1.25] sm:text-5xl sm:leading-[1.2] lg:text-[3.25rem]"
          >
            {title || defaultTitleNode}
          </motion.h1>

          <motion.p
            {...rise(0.12)}
            className="mt-5 max-w-xl text-base leading-8 text-white/75 sm:text-lg sm:leading-9"
          >
            {description || defaultDescription}
          </motion.p>

          <motion.div {...rise(0.18)} className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button asChild variant="gold" size="lg">
              <Link href={ctaTarget || "#start-request"}>
                {ctaLabel || "ابدأ طلبك"}
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/25 text-white hover:border-white/60 hover:bg-white/10">
              <Link href="#services">
                <LayoutGrid className="size-4" aria-hidden="true" />
                استعرض الخدمات
              </Link>
            </Button>
          </motion.div>

          <motion.div {...rise(0.24)} className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold text-white/80">
            <Link href="/track" className="inline-flex items-center gap-2 underline-offset-4 transition hover:text-white hover:underline">
              <Search className="size-4 text-accent" aria-hidden="true" />
              تتبع طلبك
            </Link>
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 underline-offset-4 transition hover:text-white hover:underline"
            >
              <MessageCircle className="size-4 text-accent" aria-hidden="true" />
              تواصل واتساب
            </a>
          </motion.div>

          <motion.ul
            data-testid="homepage-trust-signals"
            aria-label="مزايا بدء الطلب من الموقع"
            {...rise(0.3)}
            className="mt-9 flex w-full flex-col gap-x-7 gap-y-2.5 border-t border-white/10 pt-6 text-sm font-semibold text-white/85 sm:flex-row sm:flex-wrap"
          >
            {trustSignals.map((label) => (
              <li key={label} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{label}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <BookingSearchWidget initialCatalog={catalog} />
        </motion.div>
      </div>
    </MotionConfig>
  );
}
