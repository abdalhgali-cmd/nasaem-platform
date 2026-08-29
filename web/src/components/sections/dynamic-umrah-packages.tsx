"use client";

/* eslint-disable react-hooks/set-state-in-effect -- initial catalog load synchronizes with the public API. */
/* eslint-disable @next/next/no-img-element -- public asset URLs are backend-managed and dynamic. */

import * as React from "react";
import { Check, ImageOff, Loader2, Package, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { cn } from "@/lib/utils";

type PublicPackage = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: string;
  currency: string;
  fxRateToSdg: number | null;
  priceSdg: number | null;
  iconKey: string | null;
  imageKey: string | null;
  features: string[] | null;
  processingTime: string | null;
};

type PackageCard = PublicPackage & {
  included: string[];
  excluded: string[];
  duration: string;
  hotel: string;
  nights: string;
  transport: string;
  visa: string;
};

function parsePackage(item: PublicPackage): PackageCard {
  const features = item.features ?? [];
  const read = (prefix: string) => features.find((feature) => feature.startsWith(`${prefix}:`))?.slice(prefix.length + 1).trim() ?? "";
  const included = features.filter((feature) => feature.startsWith("INCLUDED:")).map((feature) => feature.slice("INCLUDED:".length).trim()).filter(Boolean);
  const excluded = features.filter((feature) => feature.startsWith("EXCLUDED:")).map((feature) => feature.slice("EXCLUDED:".length).trim()).filter(Boolean);
  return { ...item, included, excluded, duration: read("DURATION") || item.processingTime || "", hotel: read("HOTEL"), nights: read("NIGHTS"), transport: read("TRANSPORT"), visa: read("VISA") };
}

function assetUrl(key: string | null) {
  return key ? `${API_URL}/site-assets/${encodeURIComponent(key)}/file` : null;
}

export function DynamicUmrahPackages({ selectedPackageCode }: { selectedPackageCode?: string }) {
  const [packages, setPackages] = React.useState<PackageCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/services/public/packages`, { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; data?: PublicPackage[]; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر تحميل الباقات");
      setPackages((payload.data ?? []).filter((item) => item.category === "UMRAH_PACKAGE").map(parsePackage));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الباقات، حاول تحديث الصفحة");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <div className="flex min-h-48 items-center justify-center rounded-3xl border border-border bg-card p-8 text-muted-foreground"><Loader2 className="me-2 size-5 animate-spin" />جاري تحميل الباقات...</div>;
  }

  if (error) {
    return <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center"><p className="font-bold text-destructive">{error}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void load()}><RefreshCw className="size-4" />إعادة المحاولة</Button></div>;
  }

  if (packages.length === 0) {
    return <div className="rounded-3xl border border-border bg-card p-10 text-center"><Package className="mx-auto size-10 text-muted-foreground" /><h3 className="mt-4 text-lg font-bold">لا توجد باقات متاحة حاليًا</h3><p className="mt-2 text-sm text-muted-foreground">سيتم عرض الباقات الجديدة هنا فور اعتمادها ونشرها.</p></div>;
  }

  return <div className="grid gap-6 lg:grid-cols-3">
    {packages.map((pkg, index) => {
      const image = assetUrl(pkg.imageKey);
      const isHighlighted = pkg.code === selectedPackageCode || (index === 0 && !selectedPackageCode);
      const features = pkg.included.length ? pkg.included : [pkg.duration, pkg.hotel, pkg.nights, pkg.transport, pkg.visa].filter(Boolean);
      return <article key={pkg.id} className={cn("relative flex h-full flex-col rounded-3xl border p-8 transition-all duration-300 hover:-translate-y-1.5", isHighlighted ? "border-accent bg-gradient-to-b from-primary to-[#0a2f70] text-white shadow-2xl shadow-primary/25" : "border-border bg-card shadow-sm hover:shadow-xl")}>
        {isHighlighted ? <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-accent-foreground shadow-lg"><Star className="size-3.5 fill-current" />باقة مميزة</span> : null}
        <div className="flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-muted/60">
          {image ? <img src={image} alt={pkg.name} className="h-full w-full object-cover" /> : <ImageOff className="size-9 text-muted-foreground" />}
        </div>
        <div className="mt-5 flex items-start gap-3"><Package className={cn("mt-0.5 size-7 shrink-0", isHighlighted ? "text-accent" : "text-primary dark:text-secondary")} /><div><h3 className="text-xl font-bold">{pkg.name}</h3><p className={cn("mt-2 text-sm leading-relaxed", isHighlighted ? "text-white/75" : "text-muted-foreground")}>{pkg.description || "باقة عمرة متكاملة قابلة للتخصيص."}</p></div></div>
        <div className="mt-6"><div className="flex items-baseline gap-2"><span className="text-sm">يبدأ من</span><span className="text-3xl font-extrabold">{Number(pkg.basePrice).toLocaleString("en-US")}</span><span className={cn("text-xs", isHighlighted ? "text-white/70" : "text-muted-foreground")}>{pkg.currency}</span></div>{pkg.currency !== "SDG" && pkg.priceSdg != null ? <p className={cn("mt-1 text-xs font-bold", isHighlighted ? "text-white/75" : "text-muted-foreground")}>يعادل {Math.round(pkg.priceSdg).toLocaleString("en-US")} جنيه سوداني · سعر الصرف {Number(pkg.fxRateToSdg).toLocaleString("en-US")}</p> : null}</div>
        {features.length ? <ul className="mt-6 flex-1 space-y-3">{features.map((feature) => <li key={feature} className="flex items-start gap-2.5 text-sm"><Check className={cn("mt-0.5 size-4 shrink-0", isHighlighted ? "text-accent" : "text-success")} /><span className={isHighlighted ? "text-white/90" : "text-foreground/80"}>{feature}</span></li>)}</ul> : <div className="flex-1" />}
        <Button asChild variant={isHighlighted ? "gold" : "primary"} size="lg" className="mt-8 w-full"><a href={`/packages?package=${encodeURIComponent(pkg.code)}#book`}>اطلب هذه الباقة</a></Button>
      </article>;
    })}
  </div>;
}

