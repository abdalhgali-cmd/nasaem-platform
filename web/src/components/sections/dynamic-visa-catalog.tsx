"use client";

/* eslint-disable react-hooks/set-state-in-effect -- initial catalog load synchronizes with the public API. */

import * as React from "react";
import { Briefcase, Globe2, Loader2, RefreshCw, Stamp, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { resolveServiceHref } from "@/lib/service-routes";
import { cn } from "@/lib/utils";

type PublicVisaType = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  country: string;
  description: string | null;
  basePrice: string;
  currency: string;
  type: string | null;
  processingTime: string | null;
  stayDuration: string | null;
  validity: string | null;
  entryType: string | null;
  category: string;
};

const categoryPresentation: Record<string, { label: string; icon: typeof Stamp; tone: string }> = {
  INTERNATIONAL: { label: "تأشيرة دولية", icon: Globe2, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  UMRAH: { label: "تأشيرة عمرة", icon: Stamp, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  FAMILY_VISIT: { label: "زيارة عائلية", icon: Users2, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  OTHER: { label: "تأشيرة أخرى", icon: Briefcase, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

export function DynamicVisaCatalog({ selectedVisaCode, selectedCategory }: { selectedVisaCode?: string; selectedCategory?: string }) {
  const [visas, setVisas] = React.useState<PublicVisaType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/services/public`, { cache: "no-store" });
      const payload = (await response.json()) as { success?: boolean; data?: { visaTypes?: PublicVisaType[] }; message?: string };
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر تحميل أنواع التأشيرات");
      setVisas((payload.data?.visaTypes ?? []).filter((item) => item.category !== "UMRAH_PACKAGE"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل أنواع التأشيرات، حاول تحديث الصفحة");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="flex min-h-48 items-center justify-center rounded-3xl border border-border bg-card p-8 text-muted-foreground"><Loader2 className="me-2 size-5 animate-spin" />جاري تحميل أنواع التأشيرات...</div>;
  if (error) return <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-8 text-center"><p className="font-bold text-destructive">{error}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void load()}><RefreshCw className="size-4" />إعادة المحاولة</Button></div>;

  const visibleVisas = selectedCategory ? visas.filter((visa) => visa.category === selectedCategory) : visas;
  if (visibleVisas.length === 0) return <div className="rounded-3xl border border-border bg-card p-10 text-center"><Stamp className="mx-auto size-10 text-muted-foreground" /><h3 className="mt-4 text-lg font-bold">لا توجد تأشيرات متاحة حاليًا</h3><p className="mt-2 text-sm text-muted-foreground">سيتم عرض الأنواع الجديدة هنا فور تفعيلها من لوحة الإدارة.</p></div>;

  return <div className="grid gap-6 lg:grid-cols-2">
    {visibleVisas.map((visa) => {
      const presentation = categoryPresentation[visa.category] ?? categoryPresentation.OTHER;
      const Icon = presentation.icon;
      const highlighted = visa.code === selectedVisaCode;
      const details = [visa.processingTime && `المعالجة: ${visa.processingTime}`, visa.validity && `الصلاحية: ${visa.validity}`, visa.stayDuration && `مدة الإقامة: ${visa.stayDuration}`, visa.entryType && `الدخول: ${visa.entryType}`].filter(Boolean) as string[];
      const numericPrice = Number(visa.basePrice);
      const hasPublishedPrice = Number.isFinite(numericPrice) && numericPrice > 0;
      return <article key={visa.id} className={cn("flex h-full flex-col rounded-3xl border p-7 shadow-sm transition-shadow hover:shadow-lg", highlighted ? "border-accent ring-2 ring-accent/30" : "border-border bg-card")}>
        <div className="flex items-start justify-between gap-3"><span className={cn("flex size-12 items-center justify-center rounded-2xl", presentation.tone)}><Icon className="size-6" /></span><span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-bold text-accent-foreground/80 dark:text-accent">{presentation.label}</span></div>
        <div className="mt-4 flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-foreground">{visa.name}</h3>{visa.nameEn ? <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{visa.nameEn}</p> : null}<p className="mt-1 text-xs font-medium text-muted-foreground">{visa.country}</p></div><div className="shrink-0 text-end">{hasPublishedPrice ? <><p className="text-xl font-extrabold text-primary dark:text-secondary">{numericPrice.toLocaleString("en-US")}</p><p className="text-xs text-muted-foreground">{visa.currency}</p></> : <p className="max-w-28 text-xs font-semibold leading-5 text-muted-foreground">التكلفة تحدد بعد مراجعة الطلب</p>}</div></div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{visa.description || "تفاصيل وإجراءات محدثة حسب نوع التأشيرة والوجهة."}</p>
        {details.length ? <ul className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">{details.map((detail) => <li key={detail} className="text-xs text-muted-foreground">{detail}</li>)}</ul> : null}
        <Button asChild variant="primary" size="sm" className="mt-6 w-full"><a href={resolveServiceHref(visa)}>قدّم الآن</a></Button>
      </article>;
    })}
  </div>;
}
