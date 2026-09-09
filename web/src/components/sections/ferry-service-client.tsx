"use client";

import * as React from "react";
import Link from "next/link";
import { useLocalDate } from "@/lib/use-local-date";
import { RequestConfirmation } from "./request-confirmation";
import { ServiceLoadError } from "./service-load-error";
import { usePublicService } from "@/lib/use-public-service";
import { readRequestReference, uncertainRequestMessage } from "@/lib/request-response";
import { LegalDisclosure } from "@/components/legal-disclosure";
import { CalendarDays, Ship, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { API_URL } from "@/lib/api-url";

const inputClass = "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

// Same fallback posture as every other public-content fetch in this
// codebase (getSiteAssetUrls, getPublicHomepage, ...): if no admin has
// configured ferry operators/routes yet, or the request fails, these are
// exactly what this form's <select> options hardcoded before Platform
// 3.0 Phase 9 — so the form keeps working unchanged either way.
const FALLBACK_ROUTES = ["سواكن → جدة", "جدة → سواكن", "مسار آخر"];
const FALLBACK_CARRIERS = ["تاركو البحرية", "الجودي", "كنزي", "لا يهم"];

export function FerryServiceClient() {
  const { serviceId, loading, serviceError, retry } = usePublicService("SVC-FERRY");
  const submitLock = React.useRef(false);
  const [routeOptions, setRouteOptions] = React.useState<string[]>(FALLBACK_ROUTES);
  const [carrierOptions, setCarrierOptions] = React.useState<string[]>(FALLBACK_CARRIERS);
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", route: FALLBACK_ROUTES[0], travelDate: "", travelers: 1, carrier: FALLBACK_CARRIERS[0], notes: "" });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  React.useEffect(() => {
    fetch(`${API_URL}/ferries/public`).then((r) => r.json()).then((payload) => {
      const operators: { name: string }[] = payload?.data?.operators ?? [];
      const schedules: { origin: string; destination: string }[] = payload?.data?.schedules ?? [];

      const routes = Array.from(new Set(schedules.map((s) => `${s.origin} → ${s.destination}`)));
      if (routes.length > 0) {
        setRouteOptions(routes);
        setForm((prev) => ({ ...prev, route: routes[0] }));
      }

      const carriers = operators.map((o) => o.name);
      if (carriers.length > 0) {
        setCarrierOptions(carriers);
        setForm((prev) => ({ ...prev, carrier: carriers[0] }));
      }
      // No operators/schedules configured yet: silently keep the fallback
      // options set at mount — never blank the form.
    }).catch(() => {
      // Never blank the form's dropdowns just because this optional
      // enrichment fetch failed — the fallback options already in state
      // keep the form fully usable.
    });
  }, []);

  const today = useLocalDate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitLock.current) return;
    setError(""); setSuccess("");
    if (!serviceId) return setError("تعذر تجهيز خدمة العبارات. أعد تحميل الخدمة أو تواصل معنا.");
    if (form.name.trim().length < 2 || form.phone.trim().length < 6 || !form.travelDate) return setError("أكمل الاسم ورقم الهاتف وتاريخ السفر.");
    if (today && form.travelDate < today) return setError("تاريخ السفر يجب أن يكون اليوم أو بعده.");
    if (!Number.isInteger(form.travelers) || form.travelers < 1 || form.travelers > 50) return setError("تحقق من عدد المسافرين.");
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contact-requests`, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: form.name, phone: form.phone, email: form.email, service: "حجز العبارات", serviceId,
        travelerCount: form.travelers,
        intakeData: { route: form.route, travelDate: form.travelDate, travelers: form.travelers, carrier: form.carrier, notes: form.notes },
        message: `طلب حجز عبارة: ${form.route} بتاريخ ${form.travelDate}، الناقل المفضل: ${form.carrier}، عدد المسافرين: ${form.travelers}. ${form.notes}`,
      }) });
      setSuccess(await readRequestReference(response));
    } catch (err) { setError((err instanceof TypeError || err instanceof DOMException) ? uncertainRequestMessage : err instanceof Error ? err.message : uncertainRequestMessage); }
    finally { submitLock.current = false; setSubmitting(false); }
  }

  return <>
    <section className="bg-primary py-16 text-primary-foreground"><Container><div className="mx-auto max-w-4xl text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10"><Ship className="size-7" /></div><p className="mt-5 text-sm font-bold text-secondary">الرحلات البحرية</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">احجز رحلتك بالعبارة</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75 sm:text-base">أرسل بيانات الرحلة والعدد والتاريخ، وسيقوم فريق نسائم الحرمين بمتابعة التوفر والإجراءات معك.</p></div></Container></section>
    <section className="-mt-8 pb-20"><Container><div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      {success ? <RequestConfirmation requestId={success} /> : <form aria-busy={submitting} onSubmit={submit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2"><span className="text-sm font-bold">الاسم الكامل</span><input required minLength={2} maxLength={120} autoComplete="name" className={inputClass} value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label>
          <label className="grid gap-2"><span className="text-sm font-bold">رقم الهاتف / واتساب</span><input required type="tel" minLength={6} maxLength={30} autoComplete="tel" dir="ltr" placeholder="+249..." className={inputClass} value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></label>
          <label className="grid gap-2"><span className="text-sm font-bold">البريد الإلكتروني (اختياري)</span><input autoComplete="email" type="email" className={inputClass} value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></label>
          <label className="grid gap-2"><span className="text-sm font-bold">المسار</span><select className={inputClass} value={form.route} onChange={(e)=>setForm({...form,route:e.target.value})}>{routeOptions.map((route)=> <option key={route}>{route}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-sm font-bold">الناقل المفضل</span><select className={inputClass} value={form.carrier} onChange={(e)=>setForm({...form,carrier:e.target.value})}>{carrierOptions.map((carrier)=> <option key={carrier}>{carrier}</option>)}</select></label>
          <label className="grid gap-2"><span className="text-sm font-bold">تاريخ السفر</span><div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground"/><input required type="date" min={today} className={`${inputClass} w-full pr-9`} value={form.travelDate} onChange={(e)=>setForm({...form,travelDate:e.target.value})}/></div></label>
          <label className="grid gap-2"><span className="text-sm font-bold">عدد المسافرين</span><div className="relative"><Users className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground"/><input type="number" min={1} max={50} className={`${inputClass} w-full pr-9`} value={form.travelers} onChange={(e)=>setForm({...form,travelers:Math.min(50,Math.max(1,Number(e.target.value)||1))})}/></div></label>
        </div>
        <label className="grid gap-2"><span className="text-sm font-bold">ملاحظات</span><textarea maxLength={1200} rows={5} className="rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" placeholder="تفضيل شركة أو وقت مناسب أو أي ملاحظات..." value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
        {serviceError ? <ServiceLoadError message={serviceError} retry={retry} /> : null}
                {loading ? <p className="text-sm text-muted-foreground">جاري تجهيز الخدمة...</p> : null}
        {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}
        <LegalDisclosure />
                {error ? <Link href="/track" className="block text-sm font-bold text-primary underline">تحقق من طلباتك قبل إعادة الإرسال</Link> : null}
                <Button type="submit" variant="gold" size="lg" disabled={submitting||loading||!serviceId}>{submitting ? "جاري الإرسال..." : "إرسال طلب حجز العبارة"}</Button>
      </form>}
    </div></Container></section>
  </>;
}
