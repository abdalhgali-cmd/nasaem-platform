"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ClipboardCheck, MessageCircle, ShieldCheck, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingSearchWidget } from "@/components/sections/booking-search-widget";

const journeySteps = [
  { icon: MessageCircle, value: "01", label: "أرسل طلبك" },
  { icon: Tag, value: "02", label: "راجع العرض" },
  { icon: ClipboardCheck, value: "03", label: "اعتمد بعد التوفر" },
  { icon: ShieldCheck, value: "04", label: "تابع الحالة" },
];

type HeroContentProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  whatsapp: string;
  defaultTitleNode: ReactNode;
  defaultDescription: string;
};

// Client component so the framer-motion entrance animations survive —
// Hero itself (the parent) is a server component that fetches admin
// content, and passes the resolved (or default) values down here.
export function HeroContent({ title, description, ctaLabel, ctaTarget, whatsapp, defaultTitleNode, defaultDescription }: HeroContentProps) {
  return (
    <>
      <motion.span
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-white/5 px-4 py-2 text-xs font-bold text-accent backdrop-blur-sm"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-accent" />
        رحلتك إلى بيت الله الحرام تبدأ من هنا
      </motion.span>

      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="max-w-4xl text-balance text-4xl font-extrabold leading-[1.15] sm:text-5xl lg:text-6xl"
      >
        {title || defaultTitleNode}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-white/80 sm:text-lg"
      >
        {description || defaultDescription}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="mt-9 flex flex-wrap items-center justify-center gap-4"
      >
        <Button asChild variant="gold" size="lg">
          <Link href={ctaTarget || "/packages"}>
            {ctaLabel || "استكشف الباقات"}
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="whatsapp" size="lg">
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
            تواصل واتساب
          </a>
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="mt-14 w-full"
      >
        <BookingSearchWidget />
      </motion.div>

      <motion.dl
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.55 }}
        className="mt-14 grid w-full max-w-3xl grid-cols-2 gap-4 border-t border-white/10 pt-8 sm:grid-cols-4"
      >
        {journeySteps.map(({ icon: Icon, value, label }) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <Icon className="size-5 text-accent" />
            <dt className="sr-only">{label}</dt>
            <dd className="text-xl font-extrabold sm:text-2xl">{value}</dd>
            <span className="text-xs text-white/70">{label}</span>
          </div>
        ))}
      </motion.dl>
    </>
  );
}
