"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Calendar, FileCheck2, Hotel, MapPin, Plane, Search, Ship, Sparkles, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "umrah" | "visas" | "flights" | "ferries" | "hotels";

const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "umrah", label: "العمرة", icon: Sparkles },
  { key: "visas", label: "التأشيرات", icon: FileCheck2 },
  { key: "flights", label: "الطيران", icon: Plane },
  { key: "ferries", label: "البواخر", icon: Ship },
  { key: "hotels", label: "الفنادق", icon: Hotel },
];

const visaShortcuts = [
  { label: "زيارة عائلية للسعودية", description: "ابدأ الطلب وأدخل بيانات الأسرة والمستندات.", href: "/visas/saudi-family-visit" },
  { label: "الموافقة الأمنية لمصر", description: "قدّم الطلب وارفع صورة الجواز مباشرة.", href: "/visas/egypt-security-approval" },
  { label: "تأشيرات أخرى", description: "استعرض التأشيرات المتاحة واختر وجهتك.", href: "/visas" },
];

function FieldShell({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 px-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition focus:border-primary";

export function BookingSearchWidget() {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("umrah");
  const [from, setFrom] = React.useState("الخرطوم");
  const [to, setTo] = React.useState("جدة");
  const [city, setCity] = React.useState("مكة المكرمة");
  const [date, setDate] = React.useState("");
  const [returnDate, setReturnDate] = React.useState("");
  const [guests, setGuests] = React.useState(1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();

    if (tab === "umrah") {
      if (date) params.set("date", date);
      params.set("guests", String(guests));
      router.push(`/umrah?${params.toString()}`);
    } else if (tab === "flights") {
      params.set("from", from);
      params.set("to", to);
      if (date) params.set("date", date);
      params.set("guests", String(guests));
      router.push(`/flights?${params.toString()}`);
    } else if (tab === "hotels") {
      params.set("city", city);
      if (date) params.set("checkin", date);
      if (returnDate) params.set("checkout", returnDate);
      params.set("guests", String(guests));
      router.push(`/hotels?${params.toString()}`);
    }
  }

  return (
    <div id="start-request" className="bg-glass w-full max-w-4xl scroll-mt-24 rounded-3xl border border-white/20 p-2.5 shadow-2xl shadow-primary/10 sm:p-3">
      <div className="px-3 pb-2 pt-1 text-right">
        <p className="text-sm font-extrabold text-foreground">ما الخدمة التي تحتاجها؟</p>
        <p className="mt-1 text-xs text-muted-foreground">اختر الخدمة وابدأ مباشرة، أو تابع طلبًا سابقًا من صفحة التتبع.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1" role="tablist" aria-label="اختيار الخدمة">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "relative flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors",
              tab === key
                ? "text-primary-foreground"
                : "text-foreground/70 hover:text-foreground"
            )}
          >
            {tab === key ? (
              <motion.span
                layoutId="search-tab-bg"
                className="absolute inset-0 rounded-2xl bg-primary"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            ) : null}
            <span className="relative flex items-center gap-2">
              <Icon className="size-4" />
              {label}
            </span>
          </button>
        ))}
      </div>

      {tab === "visas" ? (
        <div className="grid gap-3 rounded-2xl bg-card/80 p-4 sm:grid-cols-3">
          {visaShortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-border bg-background p-4 text-right transition hover:border-primary/40 hover:bg-primary/5"
            >
              <FileCheck2 className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm font-extrabold text-foreground">{item.label}</p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
            </Link>
          ))}
        </div>
      ) : tab === "ferries" ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-card/80 p-4 text-right sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-foreground">حجز البواخر بين السودان والسعودية</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">اختر الرحلة والباخرة والتاريخ من صفحة الحجز، ثم أرسل طلبك للمتابعة.</p>
          </div>
          <Button asChild variant="gold" size="lg" className="w-full shrink-0 sm:w-auto">
            <Link href="/ferries">
              <Ship className="size-4" />
              ابدأ حجز الباخرة
            </Link>
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-2xl bg-card/80 p-4 sm:flex-row sm:items-end"
        >
          {tab === "umrah" ? (
            <>
              <FieldShell label="تاريخ السفر" icon={Calendar}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="عدد المعتمرين" icon={Users}>
                <input
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value) || 1)}
                  className={inputClass}
                />
              </FieldShell>
            </>
          ) : null}

          {tab === "flights" ? (
            <>
              <FieldShell label="من" icon={MapPin}>
                <input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="إلى" icon={MapPin}>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="تاريخ المغادرة" icon={Calendar}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="المسافرون" icon={Users}>
                <input
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value) || 1)}
                  className={inputClass}
                />
              </FieldShell>
            </>
          ) : null}

          {tab === "hotels" ? (
            <>
              <FieldShell label="المدينة" icon={MapPin}>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="تاريخ الدخول" icon={Calendar}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="تاريخ الخروج" icon={Calendar}>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className={inputClass}
                />
              </FieldShell>
              <FieldShell label="النزلاء" icon={Users}>
                <input
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value) || 1)}
                  className={inputClass}
                />
              </FieldShell>
            </>
          ) : null}

          <Button type="submit" variant="gold" size="lg" className="w-full shrink-0 sm:w-auto">
            <Search className="size-4" />
            ابدأ الآن
          </Button>
        </form>
      )}
    </div>
  );
}
