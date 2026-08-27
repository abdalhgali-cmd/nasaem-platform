"use client";

/* eslint-disable react-hooks/set-state-in-effect -- initial catalog load synchronizes with the public API. */

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Package, RefreshCw, Sparkles, Star } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api-url";

type PublicPackage = { id: string; code: string; name: string; description: string | null; basePrice: string; currency: string; features: string[] | null };

function includedFeatures(features: string[] | null) {
  return (features ?? []).filter((feature) => feature.startsWith("INCLUDED:")).map((feature) => feature.slice("INCLUDED:".length).trim()).filter(Boolean);
}

export function FeaturedUmrah() {
  const [packages, setPackages] = React.useState<PublicPackage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${API_URL}/services/public/packages`, { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; data?: PublicPackage[]; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر تحميل باقات العمرة");
      setPackages(payload.data ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل باقات العمرة");
    } finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, []);
  const visible = packages.slice(0, 3);

  return <section className="py-24"><Container>
    <SectionHeading eyebrow="باقات العمرة" title="اختر الباقة التي تناسب رحلتك" description="الأسعار المعروضة من الكتالوج الحالي، والتكلفة النهائية يحددها الموظف حسب الموسم والخدمات المطلوبة." />
    {loading ? <div className="mt-14 flex min-h-32 items-center justify-center rounded-3xl border border-border bg-card p-6 text-muted-foreground"><Loader2 className="me-2 size-5 animate-spin" />جاري تحميل الباقات...</div> : null}
    {error ? <div className="mt-14 rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-center"><p className="font-bold text-destructive">{error}</p><Button type="button" variant="outline" className="mt-3" onClick={() => void load()}><RefreshCw className="size-4" />إعادة المحاولة</Button></div> : null}
    {!loading && !error && visible.length === 0 ? <div className="mt-14 rounded-3xl border border-border bg-card p-8 text-center"><Package className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-bold">لا توجد باقات منشورة حاليًا</p><p className="mt-1 text-sm text-muted-foreground">استعرض الباقات لاحقًا أو تواصل معنا لتصميم برنامج مخصص.</p></div> : null}
    {!loading && !error && visible.length ? <Stagger className="mt-14 grid gap-6 lg:grid-cols-3">{visible.map((pkg, index) => { const highlighted = index === 1 || pkg.code === "featured"; const features = includedFeatures(pkg.features); return <FadeIn key={pkg.id} delay={index * 0.08} className="h-full"><div className={cn("relative flex h-full flex-col rounded-3xl border p-8 transition-all duration-300 hover:-translate-y-1.5", highlighted ? "border-accent bg-gradient-to-b from-primary to-[#0a2f70] text-white shadow-2xl shadow-primary/25" : "border-border bg-card shadow-sm hover:shadow-xl")}>{highlighted ? <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground shadow-lg"><Star className="size-3.5 fill-current" />الأكثر طلبًا</span> : null}<Sparkles className={cn("size-8", highlighted ? "text-accent" : "text-primary dark:text-secondary")} /><h3 className="mt-4 text-xl font-bold">{pkg.name}</h3><p className={cn("mt-2 text-sm leading-relaxed", highlighted ? "text-white/75" : "text-muted-foreground")}>{pkg.description || "باقة عمرة متكاملة حسب احتياجك."}</p><div className="mt-6 flex items-baseline gap-2"><span className="text-sm">يبدأ من</span><span className="text-3xl font-extrabold">{Number(pkg.basePrice).toLocaleString("en-US")}</span><span className={cn("text-xs", highlighted ? "text-white/70" : "text-muted-foreground")}>{pkg.currency}</span></div>{features.length ? <ul className="mt-6 flex-1 space-y-3">{features.map((feature) => <li key={feature} className="flex items-start gap-2.5 text-sm"><Check className={cn("mt-0.5 size-4 shrink-0", highlighted ? "text-accent" : "text-success")} /><span className={highlighted ? "text-white/90" : "text-foreground/80"}>{feature}</span></li>)}</ul> : <div className="flex-1" />}<Button asChild variant={highlighted ? "gold" : "primary"} size="lg" className="mt-8 w-full"><Link href={`/packages?package=${encodeURIComponent(pkg.code)}#book`}>احجز هذه الباقة</Link></Button></div></FadeIn>; })}</Stagger> : null}
    <FadeIn className="mt-10 text-center"><Link href="/packages" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline dark:text-secondary">عرض كل الباقات<RefreshCw className="size-4" /></Link></FadeIn>
  </Container></section>;
}
