"use client";
/* eslint-disable react-hooks/set-state-in-effect -- debounced airport-suggestion lookup synchronizes with the public API. */
/* eslint-disable @next/next/no-img-element -- airline logos are served by the environment-specific backend asset endpoint. */

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Check, Plane, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { API_URL } from "@/lib/api-url";
import { cn } from "@/lib/utils";
import { FlightBookingClient } from "@/components/sections/flight-booking-client";

type TripType = "ONE_WAY" | "ROUND_TRIP" | "MULTI_CITY";
type Leg = { from: string; to: string; departureDate: string };
type PassengerType = "ADULT" | "CHILD" | "INFANT";
type PassengerCounts = { adults: number; children: number; infants: number };
type PassengerPrice = { amount: number; currency: string };
type Flight = { id: string; source: "MANUAL" | "TRIP"; airline: string; flightNumber: string; origin: { code?: string | null; name: string }; destination: { code?: string | null; name: string }; departureAt: string; arrivalAt: string; durationMinutes?: number | null; stops: number; baggage?: string | null; fareRules?: string | null; passengerPrices?: Partial<Record<PassengerType, PassengerPrice>> | null; cabin?: string | null; price: number; currency: string; priceSdg?: number | null; fxRateToSdg?: number | null; airlineLogoKey?: string | null };

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
function formatSdg(value?: number | null) { return value == null ? "السعر غير متاح" : `${new Intl.NumberFormat("ar-SD", { maximumFractionDigits: 2 }).format(value)} ج.س`; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-2"><span className="text-xs font-bold text-muted-foreground">{label}</span>{children}</label>; }
const passengerLabels: Record<PassengerType, string> = { ADULT: "بالغ", CHILD: "طفل", INFANT: "رضيع" };
const sudanAirports = [{ code: "KRT", label: "الخرطوم" }, { code: "PZU", label: "بورتسودان" }, { code: "KSL", label: "كسلا" }];

function PassengerCounter({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div><p className="text-sm font-black">{label}</p><p className="text-xs text-muted-foreground">{hint}</p></div><div className="flex items-center gap-2"><button type="button" aria-label={`إنقاص ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="size-9 rounded-lg border font-black disabled:opacity-40">−</button><output aria-label={`عدد ${label}`} className="w-6 text-center font-black">{value}</output><button type="button" aria-label={`زيادة ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="size-9 rounded-lg border font-black disabled:opacity-40">+</button></div></div>;
}

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
  const [passengers, setPassengers] = React.useState<PassengerCounts>({ adults: 1, children: 0, infants: 0 });
  const [legs, setLegs] = React.useState<Leg[]>([{ from: "بورتسودان", to: "جدة", departureDate: "" }]);
  const [returnDate, setReturnDate] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [results, setResults] = React.useState<Array<{ leg: number; manual: Flight[]; trip: Flight[] }>>([]);
  const [tripConfigured, setTripConfigured] = React.useState(false);
  const [selectedFlights, setSelectedFlights] = React.useState<Record<number, Flight>>({});
  const [showBooking, setShowBooking] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const travelers = passengers.adults + passengers.children + passengers.infants;

  function updateLeg(index: number, patch: Partial<Leg>) { setLegs((current) => current.map((leg, i) => i === index ? { ...leg, ...patch } : leg)); }
  function addLeg() { setLegs((current) => [...current, { from: current.at(-1)?.to ?? "", to: "", departureDate: "" }]); }
  function removeLeg(index: number) { setLegs((current) => current.length <= 1 ? current : current.filter((_, i) => i !== index)); }
  function selectFlight(leg: number, flight: Flight) { if (flight.priceSdg == null || flight.source !== "MANUAL") return; setSelectedFlights((current) => ({ ...current, [leg]: flight })); }
  function resetType(key: TripType) { setTripType(key); setError(""); setSelectedFlights({}); if (key !== "MULTI_CITY") setLegs((current) => [current[0]]); }
  const allLegsSelected = results.length > 0 && results.every((group) => Boolean(selectedFlights[group.leg]));
  const perPassengerPrice = Object.values(selectedFlights).reduce((sum, flight) => sum + Number(flight.priceSdg || 0), 0);
  const selectedList = Object.keys(selectedFlights).sort((a,b) => Number(a)-Number(b)).map((key) => selectedFlights[Number(key)]);

  async function search() {
    setError(""); setSelectedFlights({}); setSearched(false);
    if (legs.some((leg) => !leg.from || !leg.to || !leg.departureDate)) return setError("أكمل بيانات جميع قطاعات الرحلة أولاً.");
    if (legs.some((leg) => leg.from.trim().toLowerCase() === leg.to.trim().toLowerCase())) return setError("يجب أن يختلف مطار المغادرة عن مطار الوصول.");
    if (tripType === "ROUND_TRIP" && !returnDate) return setError("حدد تاريخ العودة.");
    if (tripType === "ROUND_TRIP" && returnDate < legs[0].departureDate) return setError("تاريخ العودة يجب أن يكون بعد تاريخ الذهاب.");
    if (legs.some((leg) => leg.departureDate < today)) return setError("لا يمكن البحث عن رحلة بتاريخ سابق.");
    if (legs.some((leg, index) => index > 0 && leg.departureDate < legs[index - 1].departureDate)) return setError("تواريخ القطاعات المتعددة يجب أن تكون بالترتيب.");
    if (passengers.infants > passengers.adults) return setError("يجب ألا يزيد عدد الرضع عن عدد البالغين.");
    setLoading(true);
    try {
      const params = new URLSearchParams({ tripType, travelers: String(travelers), adults: String(passengers.adults), children: String(passengers.children), infants: String(passengers.infants), from: legs[0].from, to: legs[0].to, date: legs[0].departureDate });
      if (tripType === "ROUND_TRIP") params.set("returnDate", returnDate);
      if (tripType === "MULTI_CITY") params.set("legs", JSON.stringify(legs));
      const response = await fetch(`${API_URL}/flights/search?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر البحث عن الرحلات");
      setResults(payload.legs ?? []); setTripConfigured(Boolean(payload.tripConfigured)); setSearched(true);
    } catch (err) { setResults([]); setError(err instanceof Error ? err.message : "حدث خطأ أثناء البحث"); } finally { setLoading(false); }
  }

  return <>
    <section className="relative overflow-hidden bg-primary py-14 text-primary-foreground">
      <Container><div className="mx-auto max-w-4xl text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10"><Plane className="size-7" /></div><p className="mt-5 text-sm font-bold text-secondary">حجز الطيران</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">ابحث عن رحلتك</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75 sm:text-base">نعرض فقط الرحلات والأسعار الواردة من مخزون الوكالة أو المزود المفعّل. يراجع الفريق توفر المقاعد والسعر، ولا تصدر التذكرة قبل تأكيد المزود ووجود رقم الحجز PNR.</p></div></Container>
    </section>
    <section className="-mt-8 pb-14"><Container><div className="rounded-3xl border border-border bg-card p-4 shadow-2xl sm:p-6">
      <div className="grid gap-2 sm:grid-cols-3">{([["ONE_WAY", "ذهاب فقط"], ["ROUND_TRIP", "ذهاب وعودة"], ["MULTI_CITY", "مدن متعددة"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => resetType(key)} className={cn("rounded-2xl px-4 py-3 text-sm font-extrabold transition", tripType === key ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70")}>{label}</button>)}</div>
      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-muted-foreground">مطارات سودانية:</span>{sudanAirports.map((airport) => <button key={airport.code} type="button" onClick={() => updateLeg(0, { from: airport.code })} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:border-primary">{airport.label} · {airport.code}</button>)}</div>
        {legs.map((leg, index) => <div key={index} className="rounded-2xl border border-border p-4">{tripType === "MULTI_CITY" ? <div className="mb-3 text-xs font-black text-primary">القطاع {index + 1}</div> : null}<div className="grid gap-4 md:grid-cols-3"><AirportField label="من" value={leg.from} onChange={(value) => updateLeg(index, { from: value })} /><AirportField label="إلى" value={leg.to} onChange={(value) => updateLeg(index, { to: value })} /><Field label="تاريخ السفر"><div className="relative"><CalendarDays className="absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="date" min={index ? legs[index - 1].departureDate || today : today} value={leg.departureDate} onChange={(e) => updateLeg(index, { departureDate: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-background px-9 text-sm outline-none focus:border-primary" /></div></Field></div>{tripType === "MULTI_CITY" && legs.length > 1 ? <button type="button" onClick={() => removeLeg(index)} className="mt-3 text-xs font-bold text-destructive">حذف القطاع</button> : null}</div>)}
        {tripType === "ROUND_TRIP" ? <Field label="تاريخ العودة"><input type="date" min={legs[0].departureDate || today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></Field> : null}
        <div><div className="mb-2 flex items-center gap-2 text-xs font-bold text-muted-foreground"><Users className="size-4" />المسافرون · {travelers}</div><div className="grid gap-2 sm:grid-cols-3"><PassengerCounter label="البالغون" hint="12 سنة فأكثر" value={passengers.adults} min={1} max={9 - passengers.children - passengers.infants} onChange={(adults) => setPassengers((current) => ({ ...current, adults }))} /><PassengerCounter label="الأطفال" hint="من 2 إلى 11 سنة" value={passengers.children} min={0} max={9 - passengers.adults - passengers.infants} onChange={(children) => setPassengers((current) => ({ ...current, children }))} /><PassengerCounter label="الرضع" hint="أقل من سنتين" value={passengers.infants} min={0} max={Math.min(passengers.adults, 9 - passengers.adults - passengers.children)} onChange={(infants) => setPassengers((current) => ({ ...current, infants }))} /></div></div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">{tripType === "MULTI_CITY" ? <Button type="button" variant="outline" onClick={addLeg}><Plus className="size-4" />إضافة قطاع</Button> : <span />}<Button type="button" variant="gold" size="lg" onClick={search} disabled={loading}><Search className="size-4" />{loading ? "جاري البحث..." : "بحث عن الرحلات"}</Button></div>
        {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}
      </div>
    </div></Container></section>
    {searched && !results.some((group) => group.manual.length || group.trip.length) ? <section className="pb-20"><Container><div className="rounded-3xl border border-border bg-card p-8 text-center"><h2 className="text-xl font-black">لا توجد رحلات موثقة لهذه الرحلة حاليًا</h2><p className="mt-2 text-sm text-muted-foreground">جرّب تاريخًا آخر. لن نعرض سعرًا أو توفرًا غير وارد من المصدر.</p></div></Container></section> : null}
    {results.some((group) => group.manual.length || group.trip.length) ? <section className="pb-20"><Container>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-muted-foreground">نتائج البحث</p><h2 className="mt-1 text-2xl font-black">الرحلات المتاحة</h2></div><span className="rounded-full bg-muted px-4 py-2 text-xs font-bold">الأسعار من المصدر</span></div>
      {!tripConfigured ? <p className="mb-5 rounded-2xl border border-secondary/30 bg-secondary/10 p-4 text-sm font-bold">تكامل المزود غير مفعّل حاليًا؛ النتائج المعروضة من مخزون الوكالة فقط.</p> : null}
      <div className="space-y-8">{results.map((group) => { const flights = [...group.manual, ...group.trip]; const groupLabel = tripType === "ROUND_TRIP" ? (group.leg === 1 ? "رحلة الذهاب" : "رحلة العودة") : results.length > 1 ? `القطاع ${group.leg}` : "الرحلة"; return <div key={group.leg}><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-black">{groupLabel}</h3>{selectedFlights[group.leg] ? <span className="text-xs font-black text-emerald-600">✓ تم الاختيار</span> : null}</div>{flights.length ? <div className="space-y-3">{flights.map((flight) => { const selected = selectedFlights[group.leg]?.id === flight.id; return <article key={`${flight.source}-${flight.id}`} className={cn("rounded-3xl border bg-card p-5 shadow-sm", selected ? "border-primary ring-2 ring-primary/20" : "border-border")}><div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center"><div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center"><div><p className="text-xs font-bold text-muted-foreground">{flight.source === "MANUAL" ? "مخزون وكالة نسائم" : "مزود الرحلات"}</p><p className="mt-1 flex items-center gap-2 font-black">{flight.airlineLogoKey ? <img src={`${API_URL}/site-assets/${flight.airlineLogoKey}/file`} alt="" className="size-6 shrink-0 rounded bg-white object-contain" /> : null}<span>{flight.airline}</span><span className="text-xs font-bold text-muted-foreground">{flight.flightNumber}</span></p>{flight.cabin || flight.baggage ? <p className="mt-1 text-xs text-muted-foreground">{[flight.cabin, flight.baggage].filter(Boolean).join(" · ")}</p> : null}{flight.fareRules ? <p className="mt-1 text-xs text-muted-foreground">شروط السعر: {flight.fareRules}</p> : null}</div><div className="text-center"><p className="text-sm font-black">{formatDateTime(flight.departureAt)}</p><p className="my-1 text-xs text-muted-foreground">{flight.stops === 0 ? "مباشرة" : `${flight.stops} توقف`}</p><p className="text-sm font-black">{formatDateTime(flight.arrivalAt)}</p></div><div className="text-sm font-bold text-muted-foreground">{flight.origin.name} <span className="mx-1">←</span> {flight.destination.name}</div></div><div className="border-t pt-4 text-right lg:border-r lg:border-t-0 lg:pr-5 lg:pt-0"><p className="text-xs text-muted-foreground">السعر الأساسي من المصدر</p><p className="mt-1 text-xl font-black text-primary">{flight.price.toLocaleString()} {flight.currency}</p>{flight.priceSdg != null && flight.currency !== "SDG" ? <p className="mt-1 text-xs text-muted-foreground">يعادل {formatSdg(flight.priceSdg)}{flight.fxRateToSdg ? ` · صرف ${flight.fxRateToSdg}` : ""}</p> : null}{flight.passengerPrices ? <div className="mt-2 space-y-1 border-t pt-2">{Object.entries(flight.passengerPrices).map(([type, fare]) => fare ? <p key={type} className="text-xs font-bold">{passengerLabels[type as PassengerType]}: {fare.amount.toLocaleString()} {fare.currency}</p> : null)}</div> : null}{flight.source !== "MANUAL" ? <p className="mt-3 rounded-xl bg-muted p-2 text-center text-xs font-bold text-muted-foreground">للاطلاع فقط · غير قابلة للحجز المباشر</p> : <Button className="mt-3 w-full" variant={selected ? "primary" : "gold"} onClick={() => selectFlight(group.leg, flight)} disabled={flight.priceSdg == null}>{selected ? <><Check className="size-4" />تم الاختيار</> : flight.priceSdg == null ? "لا يتوفر تحويل معتمد" : "اختيار الرحلة"}</Button>}</div></div></article>; })}</div> : <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">لا توجد نتيجة موثقة لهذا القطاع.</p>}</div>; })}</div>
      {allLegsSelected ? <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-xl"><div><p className="text-xs font-bold text-muted-foreground">القطاعات المختارة</p><p className="font-black">{selectedList.length} {selectedList.length === 1 ? "رحلة" : "رحلات"} · {formatSdg(perPassengerPrice)} للمسافر</p>{passengers.infants > 0 ? <p className="mt-1 text-xs font-bold text-amber-700">الحجز مع رضيع يُسعَّر من فريق نسائم ولا يتم مباشرة من الموقع.</p> : <p className="mt-1 text-xs text-muted-foreground" data-testid="flight-search-total">الإجمالي لـ {travelers} {travelers === 1 ? "مسافر" : "مسافرين"}: {formatSdg(perPassengerPrice * travelers)}</p>}</div>{passengers.infants > 0 ? <Link href="/contact" className="inline-flex h-12 items-center rounded-xl bg-secondary px-6 text-sm font-black text-secondary-foreground">تواصل مع فريق نسائم</Link> : <Button variant="gold" size="lg" onClick={() => setShowBooking(true)}>متابعة إلى بيانات المسافرين</Button>}</div> : null}
    </Container></section> : null}
    {showBooking ? <FlightBookingClient flights={selectedList} passengerCounts={passengers} travelDate={legs[0].departureDate} onClose={() => setShowBooking(false)} /> : null}
  </>;
}
