"use client";

/* eslint-disable react-hooks/set-state-in-effect -- initial catalog load synchronizes with the public API. */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, Globe2, Loader2, Plane, RefreshCw, Stamp, Users2 } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { resolveServiceHref } from "@/lib/service-routes";

type PublicVisa = { id: string; code: string; name: string; country: string; description: string | null; processingTime: string | null; category: string };
const categoryIcons: Record<string, typeof Stamp> = { UMRAH: Stamp, FAMILY_VISIT: Users2, INTERNATIONAL: Globe2, OTHER: Briefcase };

export function VisaServices() {
  const [visas, setVisas] = React.useState<PublicVisa[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/services/public`, { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; data?: { visaTypes?: PublicVisa[] }; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر تحميل خدمات التأشيرات");
      setVisas(payload.data?.visaTypes ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل خدمات التأشيرات");
    } finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, []);

  return <section className="py-24"><Container>
    <SectionHeading eyebrow="خدمات التأشيرات" title="نُجهّز أوراقك، وأنت تجهّز حقيبتك" description="فريق متخصص يتابع طلبك خطوة بخطوة حتى استلام التأشيرة." />
    {loading ? <div className="mt-14 flex min-h-32 items-center justify-center rounded-3xl border border-border bg-card p-6 text-muted-foreground"><Loader2 className="me-2 size-5 animate-spin" />جاري تحميل الخدمات...</div> : null}
    {error ? <div className="mt-14 rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-center"><p className="font-bold text-destructive">{error}</p><Button type="button" variant="outline" className="mt-3" onClick={() => void load()}><RefreshCw className="size-4" />إعادة المحاولة</Button></div> : null}
    {!loading && !error && visas.length === 0 ? <div className="mt-14 rounded-3xl border border-border bg-card p-8 text-center text-muted-foreground">لا توجد تأشيرات متاحة حاليًا.</div> : null}
    {!loading && !error && visas.length ? <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">{visas.slice(0, 10).map((visa, index) => { const Icon = categoryIcons[visa.category] ?? Plane; return <FadeIn key={visa.id} delay={index * 0.05} className="h-full"><Link href={resolveServiceHref(visa)} className="flex h-full flex-col rounded-3xl border border-border bg-card p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary"><Icon className="size-6" /></span><h3 className="mt-4 text-base font-bold text-foreground">{visa.name}</h3><span className="mt-1.5 inline-block rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent-foreground/80 dark:text-accent">{visa.processingTime || "تختلف حسب النوع"}</span><p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground">{visa.description || `خدمة ${visa.country} بمتابعة كاملة من فريقنا.`}</p></Link></FadeIn>; })}</Stagger> : null}
    <FadeIn className="mt-10 text-center"><Link href="/visas" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline dark:text-secondary">عرض كل خدمات التأشيرات<ArrowLeft className="size-4" /></Link></FadeIn>
  </Container></section>;
}
