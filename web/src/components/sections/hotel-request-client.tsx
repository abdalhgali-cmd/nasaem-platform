"use client";

import * as React from "react";
import Link from "next/link";
import { useLocalDate } from "@/lib/use-local-date";
import { RequestConfirmation } from "./request-confirmation";
import { ServiceLoadError } from "./service-load-error";
import { usePublicService } from "@/lib/use-public-service";
import { readRequestReference, uncertainRequestMessage } from "@/lib/request-response";
import { LegalDisclosure } from "@/components/legal-disclosure";
import { CalendarDays, Hotel, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { API_URL } from "@/lib/api-url";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function HotelRequestClient() {
  const { serviceId, loading, serviceError, retry } = usePublicService("SVC-HOTEL");
  const submitLock = React.useRef(false);
  const [form, setForm] = React.useState({ city: "مكة المكرمة", checkin: "", checkout: "", guests: 1, rooms: 1, name: "", phone: "", email: "", notes: "" });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  const today = useLocalDate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current) return;
    setError("");
    setSuccess("");
    if (!serviceId) return setError("تعذر تجهيز خدمة الفنادق. أعد تحميل الخدمة أو تواصل معنا.");
    if (!form.city.trim() || !form.checkin || !form.checkout || form.name.trim().length < 2 || form.phone.trim().length < 6) return setError("أكمل المدينة والتواريخ والاسم ورقم الهاتف.");
    if (today && form.checkin < today) return setError("تاريخ الدخول يجب أن يكون اليوم أو بعده.");
    if (form.checkout <= form.checkin) return setError("تاريخ المغادرة يجب أن يكون بعد تاريخ الدخول.");
    if (!Number.isInteger(form.guests) || !Number.isInteger(form.rooms) || form.guests < 1 || form.guests > 20 || form.rooms < 1 || form.rooms > 10) return setError("تحقق من عدد النزلاء والغرف.");
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          service: "حجز الفنادق",
          serviceId,
          travelerCount: form.guests,
          intakeData: {
            city: form.city,
            checkin: form.checkin,
            checkout: form.checkout,
            guests: form.guests,
            rooms: form.rooms,
            notes: form.notes,
          },
          message: `طلب فندق في ${form.city} من ${form.checkin} إلى ${form.checkout}، عدد النزلاء ${form.guests}، الغرف ${form.rooms}. ${form.notes}`,
        }),
      });
      setSuccess(await readRequestReference(response));
    } catch (err) {
      setError((err instanceof TypeError || err instanceof DOMException) ? uncertainRequestMessage : err instanceof Error ? err.message : uncertainRequestMessage);
    } finally {
      submitLock.current = false; setSubmitting(false);
    }
  }

  return (
    <>
      <section className="bg-primary py-16 text-primary-foreground">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10"><Hotel className="size-7" /></div>
            <p className="mt-5 text-sm font-bold text-secondary">حجز الفنادق</p>
            <h1 className="mt-2 text-3xl font-black sm:text-5xl">اطلب فندقك بسهولة</h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75 sm:text-base">أرسل تفاصيل الإقامة، وسيتحقق فريق نسائم الحرمين من التوفر والسعر ويعود إليك بالعرض المناسب.</p>
          </div>
        </Container>
      </section>
      <section className="-mt-8 pb-20">
        <Container>
          <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
            {success ? (
              <RequestConfirmation requestId={success} />
            ) : (
              <form aria-busy={submitting} onSubmit={submit} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2"><span className="text-sm font-bold">المدينة</span><div className="relative"><MapPin className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input className={`${inputClass} pr-9`} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">عدد النزلاء</span><div className="relative"><Users className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="number" min={1} max={20} className={`${inputClass} pr-9`} value={form.guests} onChange={(e) => setForm({ ...form, guests: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">تاريخ الدخول</span><div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input required type="date" min={today} className={`${inputClass} pr-9`} value={form.checkin} onChange={(e) => setForm({ ...form, checkin: e.target.value })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">تاريخ الخروج</span><div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input required type="date" min={form.checkin || today} className={`${inputClass} pr-9`} value={form.checkout} onChange={(e) => setForm({ ...form, checkout: e.target.value })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">عدد الغرف</span><input type="number" min={1} max={10} className={inputClass} value={form.rooms} onChange={(e) => setForm({ ...form, rooms: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">الاسم الكامل</span><input required minLength={2} maxLength={120} autoComplete="name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">رقم الهاتف / واتساب</span><input required type="tel" minLength={6} maxLength={30} autoComplete="tel" dir="ltr" placeholder="+249..." className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">البريد الإلكتروني (اختياري)</span><input autoComplete="email" type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                </div>
                <label className="grid gap-2"><span className="text-sm font-bold">ملاحظات</span><textarea maxLength={1200} rows={4} className="rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="نوع الغرفة، قرب الفندق من الحرم، أو أي طلب خاص..." /></label>
                {serviceError ? <ServiceLoadError message={serviceError} retry={retry} /> : null}
                {loading ? <p className="text-sm text-muted-foreground">جاري تجهيز الخدمة...</p> : null}
                {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}
                <LegalDisclosure />
                {error ? <Link href="/track" className="block text-sm font-bold text-primary underline">تحقق من طلباتك قبل إعادة الإرسال</Link> : null}
                <Button type="submit" variant="gold" size="lg" disabled={loading || submitting || !serviceId}>{submitting ? "جاري الإرسال..." : "إرسال طلب الفندق"}</Button>
              </form>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
