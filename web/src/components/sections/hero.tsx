"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
import { BookingSearchWidget } from "@/components/sections/booking-search-widget";
import { siteConfig } from "@/lib/site-config";

const stats = [
  { icon: Users, value: "+15,000", label: "عميل سعيد" },
  { icon: Star, value: "4.9/5", label: "تقييم العملاء" },
  { icon: ShieldCheck, value: "10+", label: "سنوات خبرة" },
];

export function Hero({ heroImageUrl }: { heroImageUrl?: string }) {
  return (
    <section
      className={
        heroImageUrl
          ? "relative isolate overflow-hidden pb-28 pt-16 text-white sm:pt-24"
          : "relative isolate overflow-hidden bg-gradient-to-b from-primary via-primary to-[#0a2f70] pb-28 pt-16 text-white sm:pt-24"
      }
    >
      {heroImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          {/* Darker than the plain gradient used when there's no photo —
              needed to keep the white heading text legible over an
              arbitrary admin-uploaded image. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-primary/90 via-primary/80 to-[#0a2f70]/95"
          />
        </>
      ) : null}
      <GradientBackdrop variant="dark" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.18),transparent_55%)]"
      />

      <Container className="relative flex flex-col items-center text-center">
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
          نُنجز رحلتك بثقة —{" "}
          <span className="text-gold-shimmer">
            عمرة، تأشيرات، وسفر
          </span>{" "}
          دون تعقيد
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-white/80 sm:text-lg"
        >
          {siteConfig.name} تتولى عنك كل التفاصيل: باقات عمرة متكاملة، تأشيرات
          سريعة، حجوزات طيران وفنادق بأفضل الأسعار — بخبرة تمتد لأكثر من عقد
          وفريق متاح على مدار الساعة.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-4"
        >
          <Button asChild variant="gold" size="lg">
            <Link href="/packages">
              استكشف الباقات
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="whatsapp"
            size="lg"
          >
            <a
              href={`https://wa.me/${siteConfig.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
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
          className="mt-14 grid w-full max-w-2xl grid-cols-3 gap-4 border-t border-white/10 pt-8"
        >
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5">
              <Icon className="size-5 text-accent" />
              <dt className="sr-only">{label}</dt>
              <dd className="text-xl font-extrabold sm:text-2xl">{value}</dd>
              <span className="text-xs text-white/70">{label}</span>
            </div>
          ))}
        </motion.dl>
      </Container>
    </section>
  );
}
