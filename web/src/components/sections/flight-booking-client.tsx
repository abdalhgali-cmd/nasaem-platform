"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Flight = { id: string; airline: string; flightNumber: string; origin: { name: string }; destination: { name: string }; priceSdg?: number | null; currency: string; price: number };

type Passenger = { firstName: string; lastName: string; birthDate: string; gender: string; nationality: string; passportNo: string; passportIssueDate: string; passportExpiryDate: string; passportIssueCountry: string; passengerType: string };

const emptyPassenger = (): Passenger => ({ firstName: "", lastName: "", birthDate: "", gender: "", nationality: "", passportNo: "", passportIssueDate: "", passportExpiryDate: "", passportIssueCountry: "", passengerType: "ADULT" });

export function FlightBookingClient({ flight, travelers, onClose }: { flight: Flight; travelers: number; onClose: () => void }) {
  const [passengers, setPassengers] = React.useState<Passenger[]>(() => Array.from({ length: travelers }, emptyPassenger));
  const [contact, setContact] = React.useState({ fullName: "", phone: "", email: "" });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [booking, setBooking] = React.useState<any>(null);

  function updatePassenger(index: number, patch: Partial<Passenger>) { setPassengers((all) => all.map((p, i) => i === index ? { ...p, ...patch } : p)); }

  async function submit() {
    setError("");
    if (passengers.some((p) => !p.firstName || !p.lastName || !p.passportNo || !p.nationality)) return setError("أكمل بيانات المسافرين الأساسية حسب الجواز.");
    if (!contact.fullName || !contact.phone) return setError("أدخل اسم ورقم هاتف للتواصل.");
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/flight-bookings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flightId: flight.id, amount: flight.priceSdg ?? flight.price, currency: "SDG", passengers, contact }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || "تعذر إنشاء طلب الحجز");
      setBooking(payload.booking);
    } catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ"); } finally { setLoading(false); }
  }

  if (booking) return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4"><div className="mx-auto mt-10 max-w-2xl rounded-3xl bg-card p-6 shadow-2xl"><p className="text-sm font-bold text-muted-foreground">تم استلام طلب الحجز</p><h2 className="mt-2 text-2xl font-black">رقم الطلب: {booking.booking_number}</h2><p className="mt-4 leading-7 text-muted-foreground">سيقوم موظف نسائم بمراجعة الطلب وإجراء الحجز المبدئي. بعد رفع التذكرة المبدئية ستظهر لك هنا للانتقال إلى الدفع.</p><Button className="mt-6" onClick={onClose}>إغلاق</Button></div></div>;

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4"><div className="mx-auto mt-6 max-w-4xl rounded-3xl bg-card p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-muted-foreground">اختيار الرحلة</p><h2 className="text-2xl font-black">{flight.airline} · {flight.flightNumber}</h2><p className="mt-1 text-sm text-muted-foreground">{flight.origin.name} ← {flight.destination.name}</p></div><button onClick={onClose} className="text-sm font-bold text-muted-foreground">إغلاق</button></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><div><h3 className="mb-3 font-black">بيانات التواصل</h3><div className="grid gap-3"><input placeholder="الاسم الكامل" value={contact.fullName} onChange={(e) => setContact({ ...contact, fullName: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input placeholder="رقم الهاتف / واتساب" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input type="email" placeholder="البريد الإلكتروني" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /></div></div><div><h3 className="mb-3 font-black">الرحلة</h3><div className="rounded-2xl bg-muted p-4"><p className="text-sm font-bold">السعر المتوقع</p><p className="mt-1 text-2xl font-black">{Math.round(flight.priceSdg ?? flight.price).toLocaleString()} ج.س</p><p className="mt-2 text-xs text-muted-foreground">السعر النهائي يحدده الموظف بعد الحجز المبدئي.</p></div></div></div><div className="mt-8 space-y-5"><h3 className="font-black">بيانات المسافرين</h3>{passengers.map((p, i) => <div key={i} className="rounded-2xl border p-4"><p className="mb-3 text-sm font-black">المسافر {i + 1}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><input placeholder="الاسم الأول حسب الجواز" value={p.firstName} onChange={(e) => updatePassenger(i, { firstName: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input placeholder="اسم العائلة حسب الجواز" value={p.lastName} onChange={(e) => updatePassenger(i, { lastName: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input placeholder="الجنسية" value={p.nationality} onChange={(e) => updatePassenger(i, { nationality: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input placeholder="رقم الجواز" value={p.passportNo} onChange={(e) => updatePassenger(i, { passportNo: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input type="date" value={p.birthDate} onChange={(e) => updatePassenger(i, { birthDate: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input placeholder="دولة إصدار الجواز" value={p.passportIssueCountry} onChange={(e) => updatePassenger(i, { passportIssueCountry: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input type="date" value={p.passportIssueDate} onChange={(e) => updatePassenger(i, { passportIssueDate: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><input type="date" value={p.passportExpiryDate} onChange={(e) => updatePassenger(i, { passportExpiryDate: e.target.value })} className="h-11 rounded-xl border bg-background px-3" /><select value={p.passengerType} onChange={(e) => updatePassenger(i, { passengerType: e.target.value })} className="h-11 rounded-xl border bg-background px-3"><option value="ADULT">بالغ</option><option value="CHILD">طفل</option><option value="INFANT">رضيع</option></select></div></div>)}</div>{error ? <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}<div className="mt-6 flex justify-end"><Button variant="gold" size="lg" onClick={submit} disabled={loading}>{loading ? "جاري إرسال الطلب..." : "إرسال طلب الحجز"}</Button></div></div></div>;
}
