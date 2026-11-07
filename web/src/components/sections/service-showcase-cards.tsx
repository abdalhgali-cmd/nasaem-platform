"use client";

import * as React from "react";
import Link from "next/link";
import { MotionConfig, motion } from "framer-motion";
import { ArrowLeft, FileCheck2, Hotel, PackageOpen, Plane, Ship, Sparkles, Stamp, type LucideIcon } from "lucide-react";

export type ShowcaseService = {
  key: "umrah" | "egypt" | "visas" | "flights" | "ferries" | "hotels" | "packages";
  title: string;
  description: string;
  href: string;
  count: number;
};

const ICONS: Record<ShowcaseService["key"], LucideIcon> = {
  umrah: Sparkles,
  egypt: Stamp,
  visas: FileCheck2,
  flights: Plane,
  ferries: Ship,
  hotels: Hotel,
  packages: PackageOpen,
};

// A soft gold light follows the pointer across the card (CSS variables set on
// pointer move, no re-render); touch devices and keyboard focus get the same
// lift and border without it.
// Umrah, the agency's main service, gets a wider deep-blue card.
function SpotlightCard({ card, index }: { card: ShowcaseService; index: number }) {
  const ref = React.useRef<HTMLAnchorElement>(null);
  const Icon = ICONS[card.key];
  const featured = card.key === "umrah";

  function onPointerMove(event: React.PointerEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 6) * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={featured ? "h-full sm:col-span-2" : "h-full"}
    >
      <Link
        ref={ref}
        href={card.href}
        onPointerMove={onPointerMove}
        data-testid="home-service-card"
        data-service={card.key}
        className={`group relative flex h-full min-h-44 flex-col overflow-hidden rounded-3xl border p-6 shadow-sm outline-none transition duration-300 hover:-translate-y-1 hover:border-accent/60 hover:shadow-xl hover:shadow-primary/10 focus-visible:-translate-y-1 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
          featured ? "border-primary/40 bg-gradient-to-bl from-[#082b6b] via-primary to-[#0a2f70] text-white" : "border-border bg-card"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(260px_circle_at_var(--spot-x,50%)_var(--spot-y,0%),rgba(212,175,55,0.16),transparent_70%)]"
        />
        <span className={`relative flex size-12 items-center justify-center rounded-2xl transition-colors duration-300 ${featured ? "bg-accent/20 text-accent" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground dark:text-secondary"}`}>
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h3 className={`relative mt-5 font-extrabold ${featured ? "text-2xl text-white" : "text-lg text-foreground"}`}>{card.title}</h3>
        <p className={`relative mt-2 flex-1 text-sm leading-6 ${featured ? "max-w-md text-white/80" : "text-muted-foreground"}`}>{card.description}</p>
        <span className={`relative mt-5 inline-flex items-center gap-1.5 text-sm font-bold ${featured ? "text-accent" : "text-primary dark:text-secondary"}`}>
          ابدأ من هنا
          <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </Link>
    </motion.li>
  );
}

export function ServiceShowcaseCards({ cards }: { cards: ShowcaseService[] }) {
  return (
    <MotionConfig reducedMotion="user">
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="home-services">
        {cards.map((card, index) => (
          <SpotlightCard key={card.key} card={card} index={index} />
        ))}
      </ul>
    </MotionConfig>
  );
}
