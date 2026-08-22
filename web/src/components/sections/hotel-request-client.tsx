"use client";

import * as React from "react";
import { CalendarDays, CheckCircle2, Hotel, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { API_URL } from "@/lib/api-url";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function HotelRequestClient() {
  const [serviceId, setServiceId] = React.useState("");
  const [form, setForm] = React.useState({ city: "مكة المكرمة", checkin: "", checkout: "", guests: 1, rooms: 1, name: "", phone: "", email: "", notes: "" });
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  React.useEffect(() => {
    fetch(`${API_URL}/services/public`)
      .then((r) => r.json())
      .then((payload) => {
        const hotel = (payload?.data?.services ?? []).find((item: any) => item.code === "SVC-HOTEL");
        setServiceId(hotel?.id ?? "");
      })
      .catch(() => setError("تعذر تحميل خدمة الفنادق، حاول تحديث الصفحة."))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!serviceId) return setError("خدمة الفنادق غير مهيأة حاليًا في النظام.");
    if (!form.city || !form.checkin || !form.checkout || !form.name || !form.phone) return setError("أكمل المدينة والتواريخ والاسم ورقم الهاتف.");
    if (form.checkout <= form.checkin) return setError("تاريخ المغادرة يجب أن يكون بعد تاريخ الدخول.");
    if (form.guests < 1 || form.guests > 20 || form.rooms < 1 || form.rooms > 10) return setError("تحقق من عدد النزلاء والغرف.");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
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
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر إرسال طلب الفندق");
      setSuccess(`تم استلام طلب الفندق بنجاح. رقم الطلب: ${payload.data?.id ?? "سيظهر في المتابعة"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء إرسال الطلب");
    } finally {
      setSubmitting(false);
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
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800">
                <CheckCircle2 className="size-7" />
                <h2 className="mt-3 text-xl font-black">تم إرسال طلبك</h2>
                <p className="mt-2 text-sm leading-7">{success}</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2"><span className="text-sm font-bold">المدينة</span><div className="relative"><MapPin className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input className={`${inputClass} pr-9`} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">عدد النزلاء</span><div className="relative"><Users className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="number" min={1} max={20} className={`${inputClass} pr-9`} value={form.guests} onChange={(e) => setForm({ ...form, guests: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">تاريخ الدخول</span><div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="date" min={today} className={`${inputClass} pr-9`} value={form.checkin} onChange={(e) => setForm({ ...form, checkin: e.target.value })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">تاريخ الخروج</span><div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground" /><input type="date" min={form.checkin || today} className={`${inputClass} pr-9`} value={form.checkout} onChange={(e) => setForm({ ...form, checkout: e.target.value })} /></div></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">عدد الغرف</span><input type="number" min={1} max={10} className={inputClass} value={form.rooms} onChange={(e) => setForm({ ...form, rooms: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">الاسم الكامل</span><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">رقم الهاتف / واتساب</span><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                  <label className="grid gap-2"><span className="text-sm font-bold">البريد الإلكتروني</span><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                </div>
                <label className="grid gap-2"><span className="text-sm font-bold">ملاحظات</span><textarea rows={4} className="rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="نوع الغرفة، قرب الفندق من الحرم، أو أي طلب خاص..." /></label>
                {loading ? <p className="text-sm text-muted-foreground">جاري تجهيز الخدمة...</p> : null}
                {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}
                <Button type="submit" variant="gold" size="lg" disabled={loading || submitting || !serviceId}>{submitting ? "جاري الإرسال..." : "إرسال طلب الفندق"}</Button>
              </form>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
