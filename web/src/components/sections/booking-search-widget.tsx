"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plane, Hotel, Sparkles, Search, Users, Calendar, MapPin, Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ORIGIN_CITIES,
  DESTINATION_CITIES,
  CABIN_CLASSES,
  defaultFarDepartureDate,
  defaultFarReturnDate,
} from "@/lib/flight-routes";
import { HOTEL_CITIES } from "@/lib/hotel-cities";

type Tab = "umrah" | "flights" | "hotels";

const tabs: { key: Tab; label: string; icon: typeof Plane }[] = [
  { key: "umrah", label: "العمرة", icon: Sparkles },
  { key: "flights", label: "الطيران", icon: Plane },
  { key: "hotels", label: "الفنادق", icon: Hotel },
];

function FieldShell({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Plane;
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
  const [from, setFrom] = React.useState(ORIGIN_CITIES[0]);
  const [to, setTo] = React.useState(DESTINATION_CITIES[0]);
  const [cabinClass, setCabinClass] = React.useState<(typeof CABIN_CLASSES)[number]["value"]>(
    "economy"
  );
  const [city, setCity] = React.useState(HOTEL_CITIES[0]);
  // Round-trip by default: linking an origin to a destination always implies
  // a return leg, and defaulting both dates well into the future (rather
  // than "today") is what surfaces business/first-class fares — those fill
  // up fastest on near-term dates.
  const [date, setDate] = React.useState(() => defaultFarDepartureDate());
  const [returnDate, setReturnDate] = React.useState(() => defaultFarReturnDate());
  const [guests, setGuests] = React.useState(1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();

    if (tab === "umrah") {
      if (date) params.set("date", date);
      params.set("guests", String(guests));
      router.push(`/umrah?${params.toString()}#request`);
    } else if (tab === "flights") {
      params.set("from", from);
      params.set("to", to);
      if (date) params.set("date", date);
      if (returnDate) params.set("returnDate", returnDate);
      // The request form's "الدرجة" select is keyed by CABIN_CLASSES' Arabic
      // labels, not the "economy"/"business" value used internally here.
      params.set("cabinClass", CABIN_CLASSES.find((c) => c.value === cabinClass)?.label ?? cabinClass);
      params.set("guests", String(guests));
      router.push(`/flights?${params.toString()}#request`);
    } else {
      params.set("city", city);
      if (date) params.set("checkin", date);
      if (returnDate) params.set("checkout", returnDate);
      params.set("guests", String(guests));
      router.push(`/hotels?${params.toString()}#request`);
    }
  }

  return (
    <div className="bg-glass w-full max-w-4xl rounded-3xl border border-white/20 p-2.5 shadow-2xl shadow-primary/10 sm:p-3">
      <div className="flex flex-wrap gap-1.5 p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
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
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass}>
                {ORIGIN_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldShell>
            <FieldShell label="إلى" icon={MapPin}>
              <select value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
                {DESTINATION_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldShell>
            <FieldShell label="تاريخ الذهاب" icon={Calendar}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </FieldShell>
            <FieldShell label="تاريخ العودة" icon={Calendar}>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                min={date}
                className={inputClass}
              />
            </FieldShell>
            <FieldShell label="الدرجة" icon={Armchair}>
              <select
                value={cabinClass}
                onChange={(e) => setCabinClass(e.target.value as typeof cabinClass)}
                className={inputClass}
              >
                {CABIN_CLASSES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
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
              <select value={city} onChange={(e) => setCity(e.target.value)} className={inputClass}>
                {HOTEL_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
          ابحث الآن
        </Button>
      </form>
    </div>
  );
}
