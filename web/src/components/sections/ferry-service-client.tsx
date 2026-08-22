"use client";

import * as React from "react";
import { CalendarDays, CheckCircle2, Ship, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/container";
import { API_URL } from "@/lib/api-url";

const inputClass = "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function FerryServiceClient() {
  const [serviceId, setServiceId] = React.useState("");
  const [form, setForm] = React.useState({ name: "", phone: "", email: "", route: "سواكن → جدة", travelDate: "", travelers: 1, carrier: "تاركو البحرية", notes: "" });
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  React.useEffect(() => {
    fetch(`${API_URL}/services/public`).then((r) => r.json()).then((payload) => {
      const ferry = (payload?.data?.services ?? []).find((item: any) => item.code === "SVC-FERRY");
      setServiceId(ferry?.id ?? "");
    }).catch(() => setError("تعذر تحميل خدمة العبارات، حاول تحديث الصفحة.")).finally(() => setLoading(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!serviceId) return setError("خدمة العبارات غير مهيأة حاليًا في النظام.");
    if (!form.name || !form.phone || !form.travelDate) return setError("أكمل الاسم ورقم الهاتف وتاريخ السفر.");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contact-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: form.name, phone: form.phone, email: form.email, service: "حجز العبارات", serviceId,
        travelerCount: form.travelers,
        intakeData: { route: form.route, travelDate: form.travelDate, travelers: form.travelers, carrier: form.carrier, notes: form.notes },
        message: `طلب حجز عبارة: ${form.route} بتاريخ ${form.travelDate}، الناقل المفضل: ${form.carrier}، عدد المسافرين: ${form.travelers}. ${form.notes}`,
      }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر إرسال طلب حجز العبارة");
      setSuccess(`تم استلام طلبك بنجاح. رقم الطلب: ${payload.data?.id ?? "سيظهر في المتابعة"}`);
    } catch (err) { setError(err instanceof Error ? err.message : "حدث خطأ أثناء إرسال الطلب"); }
    finally { setSubmitting(false); }
  }

  return <>
    <section className="bg-primary py-16 text-primary-foreground"><Container><div className="mx-auto max-w-4xl text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10"><Ship className="size-7" /></div><p className="mt-5 text-sm font-bold text-secondary">الرحلات البحرية</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">احجز رحلتك بالعبارة</h1><p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/75 sm:text-base">أرسل بيانات الرحلة والعدد والتاريخ، وسيقوم فريق نسائم الحرمين بمتابعة التوفر والإجراءات معك.</p></div></Container></section>
    <section className="-mt-8 pb-20"><Container><div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8">
      {success ? <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-800"><CheckCircle2 className="size-7"/><h2 className="mt-3 text-xl font-black">تم إرسال طلبك</h2><p className="mt-2 text-sm leading-7">{success}</p></div> : <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2"><span className="text-sm font-bold">الاسم الكامل</span><input className={inputClass} value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label>
          <label className="grid gap-2"><span className="text-sm font-bold">رقم الهاتف / واتساب</span><input className={inputClass} value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></label>
          <label className="grid gap-2"><span className="text-sm font-bold">البريد الإلكتروني</span><input type="email" className={inputClass} value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></label>
          <label className="grid gap-2"><span className="text-sm font-bold">المسار</span><select className={inputClass} value={form.route} onChange={(e)=>setForm({...form,route:e.target.value})}><option>سواكن → جدة</option><option>جدة → سواكن</option><option>مسار آخر</option></select></label>
          <label className="grid gap-2"><span className="text-sm font-bold">الناقل المفضل</span><select className={inputClass} value={form.carrier} onChange={(e)=>setForm({...form,carrier:e.target.value})}><option>تاركو البحرية</option><option>الجودي</option><option>كنزي</option><option>لا يهم</option></select></label>
          <label className="grid gap-2"><span className="text-sm font-bold">تاريخ السفر</span><div className="relative"><CalendarDays className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground"/><input type="date" min={new Date().toISOString().slice(0,10)} className={`${inputClass} w-full pr-9`} value={form.travelDate} onChange={(e)=>setForm({...form,travelDate:e.target.value})}/></div></label>
          <label className="grid gap-2"><span className="text-sm font-bold">عدد المسافرين</span><div className="relative"><Users className="pointer-events-none absolute right-3 top-3.5 size-4 text-muted-foreground"/><input type="number" min={1} max={50} className={`${inputClass} w-full pr-9`} value={form.travelers} onChange={(e)=>setForm({...form,travelers:Math.min(50,Math.max(1,Number(e.target.value)||1))})}/></div></label>
        </div>
        <label className="grid gap-2"><span className="text-sm font-bold">ملاحظات</span><textarea rows={5} className="rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" placeholder="تفضيل شركة أو وقت مناسب أو أي ملاحظات..." value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
        {loading ? <p className="text-sm text-muted-foreground">جاري تجهيز الخدمة...</p> : null}
        {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}
        <Button type="submit" variant="gold" size="lg" disabled={submitting||loading||!serviceId}>{submitting ? "جاري الإرسال..." : "إرسال طلب حجز العبارة"}</Button>
      </form>}
    </div></Container></section>
  </>;
}
