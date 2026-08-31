"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { useHydrationSafeReducedMotion } from "@/lib/use-hydration-safe-reduced-motion";

export function WhatsAppButton({ whatsapp = siteConfig.whatsapp }: { whatsapp?: string }) {
  const shouldReduceMotion = useHydrationSafeReducedMotion();
  const message = encodeURIComponent(
    "السلام عليكم، أرغب في الاستفسار عن خدمات نسائم الحرمين للسفر والسياحة."
  );

  return (
    <motion.a
      href={`https://wa.me/${whatsapp}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل معنا عبر واتساب"
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : { delay: 0.8, duration: 0.4, ease: "easeOut" }}
      whileHover={{ scale: shouldReduceMotion ? 1 : 1.08 }}
      whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
      className="fixed bottom-6 end-6 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-[#25D366]/40"
    >
      <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25D366]/60 [animation-duration:2.5s] motion-reduce:animate-none" />
      <MessageCircle className="size-7" fill="currentColor" strokeWidth={0} />
    </motion.a>
  );
}
