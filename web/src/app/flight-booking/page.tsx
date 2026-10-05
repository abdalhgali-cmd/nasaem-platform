"use client";

import * as React from "react";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { downloadBookingFile, fetchPublicBooking, recallBookingToken, requestBookingOtp, uploadBookingReceipt, verifyBookingOtp, type BookingCredential } from "@/lib/flight-booking-access";

const labels: Record<string,string> = { REQUESTED:"تم استلام الطلب", RESERVATION_PENDING:"جاري الحجز المبدئي", PROVISIONAL_TICKET:"تم إصدار الحجز المبدئي", PAYMENT_PENDING:"بانتظار الدفع", PAYMENT_UNDER_REVIEW:"إشعار الدفع قيد المراجعة", PAYMENT_CONFIRMED:"تم تأكيد الدفع", FINAL_TICKET_ISSUED:"تم إصدار الحجز النهائي", CANCELLED:"ملغي" };

type BankAccount = { id: string; label: string; bank_name?: string | null; account_number: string };
type Booking = { id: string; booking_number: string; customer_name: string; status: string; amount: number; currency: string; passengers?: unknown[]; hasProvisionalTicket?: boolean; hasFinalTicket?: boolean; bankAccounts?: BankAccount[] };

export default function FlightBookingPage() {
  const [number,setNumber]=React.useState(""); const [phone,setPhone]=React.useState(""); const [code,setCode]=React.useState(""); const [codeSent,setCodeSent]=React.useState(false);
  const [credential,setCredential]=React.useState<BookingCredential>({});
  const [booking,setBooking]=React.useState<Booking|null>(null); const [file,setFile]=React.useState<File|null>(null); const [loading,setLoading]=React.useState(false); const [error,setError]=React.useState("");

  // Arriving from the booking confirmation: the follow-up link carries the booking
  // number in the query and the access token in the #fragment (never sent to a server).
  /* eslint-disable react-hooks/set-state-in-effect -- reads the follow-up link once after mount (window is unavailable during SSR). */
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get("number")?.trim();
    if (!fromLink) return;
    setNumber(fromLink);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = hash.get("t") || recallBookingToken(fromLink);
    if (!token) return;
    const cred = { token };
    setCredential(cred);
    setLoading(true);
    fetchPublicBooking(fromLink, cred).then(setBooking).catch(() => setError("انتهت صلاحية رابط المتابعة. تحقق برقم هاتفك للمتابعة.")).finally(() => setLoading(false));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function sendCode(e:React.FormEvent){e.preventDefault();setLoading(true);setError("");try{await requestBookingOtp(phone.trim());setCodeSent(true)}catch(err){setError(err instanceof Error?err.message:"حدث خطأ")}finally{setLoading(false)}}
  async function verify(e:React.FormEvent){e.preventDefault();setLoading(true);setError("");try{const bearer=await verifyBookingOtp(phone.trim(),code.trim());const cred={bearer};const found=await fetchPublicBooking(number.trim(),cred);setCredential(cred);setBooking(found)}catch(err){setBooking(null);setError(err instanceof Error?err.message:"حدث خطأ")}finally{setLoading(false)}}
  async function uploadReceipt(e:React.FormEvent){e.preventDefault();if(!file||!booking)return;setLoading(true);setError("");try{setBooking(await uploadBookingReceipt(booking.booking_number,file,credential));setFile(null)}catch(err){setError(err instanceof Error?err.message:"حدث خطأ")}finally{setLoading(false)}}
  async function openFile(kind:"provisional"|"final"){if(!booking)return;setError("");try{await downloadBookingFile(booking.booking_number,kind,credential)}catch(err){setError(err instanceof Error?err.message:"حدث خطأ")}}
  return <main className="py-16"><Container><div className="mx-auto max-w-3xl"><div className="mb-8 text-center"><p className="text-sm font-bold text-primary">✈️ متابعة حجز الطيران</p><h1 className="mt-2 text-3xl font-black">تابع حجزك وادفع بأمان</h1><p className="mt-2 text-muted-foreground">أدخل رقم الحجز ورقم الهاتف المسجل في الطلب، وسنرسل لك رمز تحقق عبر واتساب.</p></div>
  {!booking?<form onSubmit={codeSent?verify:sendCode} className="rounded-3xl border bg-card p-6 shadow-sm"><div className="grid gap-4 sm:grid-cols-2"><input required value={number} onChange={e=>setNumber(e.target.value)} placeholder="رقم الحجز FLT-..." disabled={codeSent} className="h-12 rounded-xl border bg-background px-4"/><input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="رقم الهاتف / واتساب" disabled={codeSent} className="h-12 rounded-xl border bg-background px-4"/></div>{codeSent&&<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} placeholder="رمز التحقق (6 أرقام)" dir="ltr" className="mt-4 h-12 w-full rounded-xl border bg-background px-4"/>}{error&&<p className="mt-4 text-sm font-bold text-destructive">{error}</p>}<Button className="mt-5 w-full" size="lg" variant="gold" disabled={loading||(codeSent&&code.length!==6)}>{loading?"جاري التحقق...":codeSent?"متابعة الحجز":"إرسال رمز التحقق"}</Button></form>:
  <div className="space-y-5"><section className="rounded-3xl border bg-card p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">رقم الحجز</p><h2 className="text-2xl font-black">{booking.booking_number}</h2><p className="mt-2 font-bold">{booking.customer_name}</p></div><span className="rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary">{labels[booking.status]||booking.status}</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">المبلغ</p><p className="font-black">{Number(booking.amount).toLocaleString()} {booking.currency}</p></div><div><p className="text-xs text-muted-foreground">المسافرون</p><p className="font-black">{Array.isArray(booking.passengers)?booking.passengers.length:0}</p></div></div></section>
  {booking.hasProvisionalTicket&&<section className="rounded-3xl border bg-card p-6"><h3 className="text-xl font-black">الحجز المبدئي</h3><p className="mt-2 text-sm text-muted-foreground">تم حجز الرحلة مبدئيًا. راجع الملف ثم أكمل الدفع.</p><button type="button" className="mt-4 inline-flex rounded-xl border px-4 py-3 font-bold" onClick={()=>openFile("provisional")}>عرض / تحميل الحجز المبدئي</button></section>}
  {["PAYMENT_PENDING","PAYMENT_UNDER_REVIEW"].includes(booking.status)&&<section className="rounded-3xl border bg-card p-6"><h3 className="text-xl font-black">💳 الدفع</h3><p className="mt-2 text-sm text-muted-foreground">حوّل المبلغ إلى أحد الحسابات التالية ثم ارفع إشعار الدفع.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(booking.bankAccounts||[]).map((a:BankAccount)=><div key={a.id} className="rounded-2xl border p-4"><p className="font-black">{a.label}</p>{a.bank_name&&<p className="text-sm text-muted-foreground">{a.bank_name}</p>}<p className="mt-2 font-black" dir="ltr">{a.account_number}</p></div>)}</div>{booking.status==="PAYMENT_PENDING"?<form onSubmit={uploadReceipt} className="mt-5"><input required type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)} className="block w-full rounded-xl border p-3"/><Button className="mt-3 w-full" variant="gold" disabled={loading}>{loading?"جاري الرفع...":"رفع إشعار الدفع"}</Button></form>:<p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm font-bold">تم استلام إشعار الدفع، وهو الآن قيد المراجعة من فريق نسائم.</p>}</section>}
  {booking.status==="PAYMENT_CONFIRMED"&&<section className="rounded-3xl border bg-card p-6"><h3 className="text-xl font-black">✅ تم تأكيد الدفع</h3><p className="mt-2 text-sm text-muted-foreground">سيقوم الموظف بإصدار الحجز النهائي.</p></section>}
  {booking.hasFinalTicket&&<section className="rounded-3xl border bg-card p-6"><h3 className="text-xl font-black">🎫 الحجز النهائي</h3><p className="mt-2 text-sm text-muted-foreground">تم إصدار تذكرتك النهائية.</p><button type="button" className="mt-4 inline-flex rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground" onClick={()=>openFile("final")}>عرض / تحميل التذكرة النهائية</button></section>}
  {error&&<p className="text-sm font-bold text-destructive">{error}</p>}<button className="text-sm font-bold text-muted-foreground underline" onClick={()=>{setBooking(null);setCredential({});setCodeSent(false);setCode("")}}>متابعة حجز آخر</button></div>}</div></Container></main>;
}
