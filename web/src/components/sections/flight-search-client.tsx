"use client";

import * as React from "react";
import { CalendarDays, Check, Plane, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { API_URL } from "@/lib/api-url";
import { cn } from "@/lib/utils";
import { FlightBookingClient } from "@/components/sections/flight-booking-client";

type TripType = "ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY";
type Leg = { from: string; to: string; departureDate: string };
type Flight = { id: string; source: "MANUAL" | "TRIP"; airline: string; flightNumber: string; origin: { code?: string | null; name: string }; destination: { code?: string | null; name: string }; departureAt: string; arrivalAt: string; durationMinutes?: number | null; stops: number; baggage?: string | null; cabin?: string | null; price: number; currency: string; priceSdg?: number | null; fxRateToSdg?: number | null; airlineLogoKey?: string | null };

// GET /api/airports/search's public shape (backend/src/modules/airports/
// airports.service.js's PUBLIC_AIRPORT_SELECT).
type AirportSuggestion = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  cityAr: string;
  cityEn: string | null;
  iataCode: string | null;
  icaoCode: string | null;
};

function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ar-SD", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function formatSdg(value?: number | null) { return value == null ? "السعر غير متاح" : `${new Intl.NumberFormat("ar-SD").format(Math.round(value))} ج.س`; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-2"><span className="text-xs font-bold text-muted-foreground">{label}</span>{children}</label>; }

// Real-data autocomplete against the Airport directory (Platform 3.0 Phase
// 11) — searches Arabic/English name, city, IATA and ICAO in one query
// (airports.service.js's searchAirports). Selecting a suggestion fills the
// field with its IATA code (falling back to ICAO, then the Arabic name)
// since that's what flights.service.js's buildRouteWhere matches manual
// flights on (LOWER(origin_code) = LOWER($from)) — free typing still works
// exactly as before for anyone who doesn't use a suggestion.
function AirportField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = React.useState<AirportSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const term = value.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      fetch(`${API_URL}/airports/search?q=${encodeURIComponent(term)}&limit=8`)
        .then((res) => res.json())
        .then((payload) => {
          if (!ignore) setSuggestions(Array.isArray(payload?.data) ? payload.data : []);
        })
        .catch(() => {
          if (!ignore) setSuggestions([]);
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [value]);

  function selectAirport(airport: AirportSuggestion) {
    onChange(airport.iataCode || airport.icaoCode || airport.nameAr);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <Field label={label}>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          placeholder="المدينة أو رمز المطار"
        />
        {open && suggestions.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-card shadow-lg">
            {suggestions.map((airport) => (
              <li key={airport.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectAirport(airport)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted"
                >
                  <span className="font-bold text-foreground">
                    {airport.nameAr}
                    {airport.nameEn ? ` · ${airport.nameEn}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {airport.cityAr}
                    {airport.iataCode ? ` · ${airport.iataCode}` : ""}
                    {airport.icaoCode ? ` / ${airport.icaoCode}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

export function FlightSearchClient() {
  const [tripType, setTripType] = React.useState<TripType>("ONE_WAY");
  const [travelers, setTravelers] = React.useState(1);
  const [legs, setLegs] = React.useState<Leg[]>([{ from: "بورتسودان", to: "جدة", departureDate: "" }]);
  const [returnDate, setReturnDate] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [results, setResults] = React.useState<Array<{ leg: number; manual: Flight[]; trip: Flight[] }>>([]);
  const [tripConfigured, setTripConfigured] = React.useState(false);
  const [selectedFlights, setSelectedFlights] = React.useState<Record<number, Flight>>({});
  const [showBooking, setShowBooking] = React.useState(false);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  function updateLeg(index: number, patch: Partial<Leg>) { setLegs((current) => current.map((leg, i) => i === index ? { ...leg, ...patch } : leg)); }
  function addLeg() { setLegs((current) => [...current, { from: current.at(-1)?.to ?? "", to: "", departureDate: "" }]); }
  function removeLeg(index: number) { setLegs((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index)); }
  function selectFlight(leg: number, flight: Flight) { if (flight.priceSdg == null) return; setSelectedFlights((current) => ({ ...current, [leg]: flight })); }
  function resetType(key: TripType) { setTripType(key); setError(""); setSelectedFlights({}); if (key !== "MULTI_CITY") setLegs((current) => [current[0]]); }
  const allLegsSelected = results.length > 0 && results.every((group) => Boolean(selectedFlights[group.leg]));
  const selectedList = Object.keys(selectedFlights).sort((a,b) => Number(a)-Number(b)).map((key) => selectedFlights[Number(key)]);

  async function search() {
    setError(""); setSelectedFlights({});
    if (legs.some((leg) => !leg.from || !leg.to || !leg.departureDate)) return setError("أكمل بيانات جميع قطاعات الرحلة أولاً.");
    if (tripType === "ROUND_TRIP" && !returnDate) return setError("حدد تاريخ العودة.");
    if (tripType === "ROUND_TRIP" && returnDate < legs[0].departureDate) return setError("تاريخ العودة يجب أن يكون بعد تاريخ الذهاب.");
    if (legs.some((leg) => leg.departureDate < today)) return setError("لا يمكن البحث عن رحلة بتاريخ سابق.");
    setLoading(true);
    try {
      const params = new URLSearchParams({ tripType, travelers: String(Math.min(20, Math.max(1, travelers))), from: legs[0].from, to: legs[0].to, date: legs[0].departureDate });
      if (tripType === "ROUND_TRIP") params.set("returnDate", returnDate);
      if (tripType === "MULTI_CITY") params.set("legs", JSON.stringify(legs));
      const response = await fetch(`${API_URL}/flights/search?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر البحث عن الرحلات");
      setResults(payload.legs ?? []); setTripConfigured(Boolean(payload.tripConfigured));
    } catch (err) { setResults([]); setError(err instanceof Error ? err.message : "حدث خطأ أثناء البحث"); } finally { setLoading(false); }
  }

  return <>
    <section className="relative overflow-hidden bg-primary py-16 text-primary-foreground"><Container><div className="mx-auto max-w-4xl text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10"><Plane className="size-7" /></div><p className="mt-5 text-sm font-bold text-secondary">حجز الطيران</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">ابحث عن رحلتك</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75 sm:text-base">الرحلات المتاحة حاليًا هي الرحلات التي تدخلها وكالة نسائم الحرمين يدويًا أو عبر ملف Excel. أسعار الرحلات تُعرض بالجنيه السوداني حسب سعر الصرف المعتمد في الوكالة.</p></div></Container></section>
    <section className="-mt-8 pb-14"><Container><div className="rounded-3xl border border-border bg-card p-4 shadow-2xl sm:p-6"><div className="grid gap-2 sm:grid-cols-3">{([["ONE_WAY", "ذهاب فقط"], ["ROUND_TRIP", "ذهاب وعودة"], ["MULTI_CITY", "مدن متعددة"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => resetType(key)} className={cn("rounded-2xl px-4 py-3 text-sm font-extrabold transition", tripType === key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70")}>{label}</button>)}</div><div className="mt-5 space-y-4">{legs.map((leg, index) => <div key={index} className="rounded-2xl border border-border p-4">{tripType === "MULTI_CITY" ? <div className="mb-3 text-xs font-black text-primary">القطاع {index + 1}</div> : null}<div className="grid gap-4 md:grid-cols-3"><AirportField label="من" value={leg.from} onChange={(value) => updateLeg(index, { from: value })} /><AirportField label="إلى" value={leg.to} onChange={(value) => updateLeg(index, { to: value })} /><Field label="تاريخ السفر"><div className="relative"><CalendarDays className="absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="date" min={today} value={leg.departureDate} onChange={(e) => updateLeg(index, { departureDate: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-background px-9 text-sm outline-none focus:border-primary" /></div></Field></div>{tripType === "MULTI_CITY" && legs.length > 1 ? <button type="button" onClick={() => removeLeg(index)} className="mt-3 text-xs font-bold text-destructive">حذف القطاع</button> : null}</div>)}{tripType === "ROUND_TRIP" ? <Field label="تاريخ العودة"><input type="date" min={legs[0].departureDate || today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></Field> : null}<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">{tripType === "MULTI_CITY" ? <Button type="button" variant="outline" onClick={addLeg}><Plus className="size-4" />إضافة قطاع</Button> : <span /> }<div className="flex items-end gap-3"><Field label="عدد المسافرين"><div className="relative"><Users className="absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="number" min={1} max={20} value={travelers} onChange={(e) => setTravelers(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="h-11 w-32 rounded-xl border border-border bg-background px-9 text-sm outline-none" /></div></Field><Button type="button" variant="gold" size="lg" onClick={search} disabled={loading}><Search className="size-4" />{loading ? "جاري البحث..." : "بحث عن الرحلات"}</Button></div></div>{error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}</div></div></Container></section>
    {results.length ? <section className="pb-20"><Container><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-muted-foreground">نتائج البحث</p><h2 className="mt-1 text-2xl font-black">الرحلات المتاحة</h2></div><span className="rounded-full bg-muted px-4 py-2 text-xs font-bold">الأسعار بالجنيه السوداني</span></div>{!tripConfigured ? <p className="mb-5 rounded-2xl border border-secondary/30 bg-secondary/10 p-4 text-sm font-bold">تكامل Trip غير مفعّل حاليًا؛ النتائج الحالية من الرحلات التي أدخلتها الوكالة.</p> : null}<div className="space-y-8">{results.map((group) => <div key={group.leg}><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black">{results.length > 1 ? `القطاع ${group.leg}` : "الرحلة"}</h3>{selectedFlights[group.leg] ? <span className="text-xs font-black text-emerald-600">✓ تم الاختيار</span> : null}</div><div className="space-y-3">{[...group.manual, ...group.trip].map((flight) => { const selected = selectedFlights[group.leg]?.id === flight.id; return <article key={`${flight.source}-${flight.id}`} className={cn("rounded-3xl border bg-card p-5 shadow-sm", selected ? "border-primary ring-2 ring-primary/20" : "border-border")}><div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center"><div><p className="text-xs font-bold text-muted-foreground">{flight.source === "MANUAL" ? "رحلة من وكالة نسائم" : "Trip"}</p><p className="mt-1 flex items-center gap-2 font-black">{flight.airlineLogoKey ? <img src={`${API_URL}/site-assets/${flight.airlineLogoKey}/file`} alt="" className="size-6 shrink-0 rounded bg-white object-contain" /> : null}<span>{flight.airline}</span> <span className="text-xs font-bold text-muted-foreground">{flight.flightNumber}</span></p><p className="mt-1 text-xs text-muted-foreground">{flight.cabin || "Economy"} · {flight.baggage || "حسب التذكرة"}</p></div><div className="text-center"><p className="text-sm font-black">{formatDateTime(flight.departureAt)}</p><p className="my-1 text-xs text-muted-foreground">{flight.stops === 0 ? "مباشرة" : `${flight.stops} توقف`}</p><p className="text-sm font-black">{formatDateTime(flight.arrivalAt)}</p></div><div className="text-sm font-bold text-muted-foreground">{flight.origin.name} <span className="mx-1">←</span> {flight.destination.name}</div></div><div className="border-t pt-4 text-right lg:border-r lg:border-t-0 lg:pr-5 lg:pt-0"><p className="text-xs text-muted-foreground">السعر</p><p className="mt-1 text-2xl font-black text-primary">{formatSdg(flight.priceSdg)}</p><p className="mt-1 text-xs text-muted-foreground">{flight.price.toLocaleString()} {flight.currency}{flight.fxRateToSdg ? ` · صرف ${flight.fxRateToSdg}` : ""}</p><Button className="mt-3 w-full" variant={selected ? "primary" : "gold"} onClick={() => selectFlight(group.leg, flight)} disabled={flight.priceSdg == null}>{selected ? <><Check className="size-4" />تم الاختيار</> : "اختيار الرحلة"}</Button></div></div></article>; })}</div></div>)}</div>{allLegsSelected ? <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-xl"><div><p className="text-xs font-bold text-muted-foreground">القطاعات المختارة</p><p className="font-black">{selectedList.length} {selectedList.length === 1 ? "رحلة" : "رحلات"} · الإجمالي للفرد {formatSdg(selectedList.reduce((sum, f) => sum + Number(f.priceSdg || 0), 0))}</p></div><Button variant="gold" size="lg" onClick={() => setShowBooking(true)}>متابعة إلى بيانات المسافرين</Button></div> : null}</Container></section> : null}
    {showBooking ? <FlightBookingClient flights={selectedList} travelers={travelers} onClose={() => setShowBooking(false)} /> : null}
  </>;
}
