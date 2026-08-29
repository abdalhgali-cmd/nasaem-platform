"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial API synchronization. */

import * as React from "react";
import { Check, Edit3, Loader2, Package, Percent, Plus, Tags, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminRequest } from "@/lib/admin-api";

type Tab = "packages" | "coupons" | "offers";
type PackageRow = { id: string; code: string; name: string; category: string; basePrice: string | number; currency: string; active: boolean };
type Coupon = { id: string; code: string; description?: string | null; discountType: "PERCENTAGE" | "FIXED"; discountValue: string | number; active: boolean; serviceId?: string | null; service?: { id: string; name: string } | null; startDate?: string | null; expiryDate?: string | null; usageLimit?: number | null; usageLimitPerCustomer?: number | null; minOrderAmount?: string | number | null; _count?: { usages: number } };
type Offer = { id: string; title: string; description?: string | null; price: string | number; currency: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; startDate?: string | null; endDate?: string | null };
type CouponDraft = { code: string; description: string; discountType: Coupon["discountType"]; discountValue: string; serviceId: string; startDate: string; expiryDate: string; usageLimit: string; usageLimitPerCustomer: string; minOrderAmount: string; active: boolean };
type OfferDraft = { title: string; description: string; price: string; currency: string; status: Offer["status"]; startDate: string; endDate: string };
type CurrencyRates = { USD: number; SAR: number };

const blankCoupon: CouponDraft = { code: "", description: "", discountType: "PERCENTAGE", discountValue: "10", serviceId: "", startDate: "", expiryDate: "", usageLimit: "", usageLimitPerCustomer: "1", minOrderAmount: "", active: true };
const blankOffer: OfferDraft = { title: "", description: "", price: "0", currency: "SAR", status: "DRAFT", startDate: "", endDate: "" };
const dateValue = (value?: string | null) => value ? value.slice(0, 16) : "";
const optionalNumber = (value: string) => value.trim() ? Number(value) : null;
const currencies = [{ code: "USD", label: "الدولار الأمريكي" }, { code: "SAR", label: "الريال السعودي" }, { code: "SDG", label: "الجنيه السوداني" }] as const;

export function PricingManager() {
  const [tab, setTab] = React.useState<Tab>("packages");
  const [packages, setPackages] = React.useState<PackageRow[]>([]);
  const [coupons, setCoupons] = React.useState<Coupon[]>([]);
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [coupon, setCoupon] = React.useState(blankCoupon);
  const [offer, setOffer] = React.useState(blankOffer);
  const [editingCoupon, setEditingCoupon] = React.useState<string | null>(null);
  const [editingOffer, setEditingOffer] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [rates, setRates] = React.useState<CurrencyRates>({ USD: 0, SAR: 0 });

  async function load() {
    setLoading(true);
    try {
      const [services, couponList, offerList, rateList] = await Promise.all([
        adminRequest<{ data: PackageRow[] }>("/services?limit=100"),
        adminRequest<{ data: Coupon[] }>("/coupons?limit=100"),
        adminRequest<{ data: Offer[] }>("/offers"),
        adminRequest<{ data: CurrencyRates }>("/flights/admin/rates"),
      ]);
      setPackages((services.data || []).filter((item) => { const category = item.category.toLowerCase(); return category.includes("package") || category.includes("umrah"); }));
      setCoupons(couponList.data || []);
      setOffers(offerList.data || []);
      setRates({ USD: Number(rateList.data?.USD || 0), SAR: Number(rateList.data?.SAR || 0) });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل البيانات" }); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { void load(); }, []);

  async function savePrice(item: PackageRow, raw: string, currency: string) {
    const basePrice = Number(raw);
    if (!Number.isFinite(basePrice) || basePrice < 0) return setMessage({ kind: "error", text: "السعر يجب أن يكون صفرًا أو أكثر" });
    setWorking(item.id); setMessage(null);
    try {
      const result = await adminRequest<{ data: PackageRow }>(`/services/${item.id}`, { method: "PATCH", body: JSON.stringify({ basePrice, currency }) });
      setPackages((rows) => rows.map((row) => row.id === item.id ? { ...row, basePrice: result.data.basePrice, currency: result.data.currency } : row));
      setMessage({ kind: "ok", text: `تم تحديث سعر «${item.name}» للطلبات الجديدة` });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحديث السعر" }); }
    finally { setWorking(null); }
  }

  async function saveRates(event: React.FormEvent) {
    event.preventDefault(); setWorking("rates"); setMessage(null);
    if (rates.USD <= 0 || rates.SAR <= 0) { setWorking(null); return setMessage({ kind: "error", text: "أدخل سعرًا موازيًا أكبر من صفر للدولار والريال" }); }
    try {
      const result = await adminRequest<{ data: CurrencyRates }>("/flights/admin/rates", { method: "PATCH", body: JSON.stringify(rates) });
      setRates({ USD: Number(result.data.USD), SAR: Number(result.data.SAR) });
      setMessage({ kind: "ok", text: "تم تحديث أسعار السوق الموازي وستظهر المعادلات الجديدة للعملاء فورًا" });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحديث أسعار الصرف" }); }
    finally { setWorking(null); }
  }

  function editCoupon(item?: Coupon, serviceId = "") {
    setTab("coupons"); setMessage(null);
    if (!item) { setEditingCoupon("new"); setCoupon({ ...blankCoupon, serviceId }); return; }
    setEditingCoupon(item.id);
    setCoupon({ code: item.code, description: item.description || "", discountType: item.discountType, discountValue: String(item.discountValue), serviceId: item.serviceId || "", startDate: dateValue(item.startDate), expiryDate: dateValue(item.expiryDate), usageLimit: item.usageLimit == null ? "" : String(item.usageLimit), usageLimitPerCustomer: item.usageLimitPerCustomer == null ? "" : String(item.usageLimitPerCustomer), minOrderAmount: item.minOrderAmount == null ? "" : String(item.minOrderAmount), active: item.active });
  }

  async function saveCoupon(event: React.FormEvent) {
    event.preventDefault(); setWorking("coupon"); setMessage(null);
    const body = { description: coupon.description, discountType: coupon.discountType, discountValue: Number(coupon.discountValue), serviceId: coupon.serviceId || null, startDate: coupon.startDate ? new Date(coupon.startDate).toISOString() : null, expiryDate: coupon.expiryDate ? new Date(coupon.expiryDate).toISOString() : null, usageLimit: optionalNumber(coupon.usageLimit), usageLimitPerCustomer: optionalNumber(coupon.usageLimitPerCustomer), minOrderAmount: optionalNumber(coupon.minOrderAmount), active: coupon.active };
    try {
      const result = editingCoupon === "new"
        ? await adminRequest<{ data: Coupon }>("/coupons", { method: "POST", body: JSON.stringify({ ...body, code: coupon.code }) })
        : await adminRequest<{ data: Coupon }>(`/coupons/${editingCoupon}`, { method: "PATCH", body: JSON.stringify(body) });
      setCoupons((rows) => editingCoupon === "new" ? [result.data, ...rows] : rows.map((row) => row.id === editingCoupon ? result.data : row));
      setEditingCoupon(null); setCoupon(blankCoupon); setMessage({ kind: "ok", text: "تم حفظ الكوبون وربطه بنطاق الباقات المحدد" });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر حفظ الكوبون" }); }
    finally { setWorking(null); }
  }

  async function toggleCoupon(item: Coupon) {
    setWorking(item.id); setMessage(null);
    try {
      const result = await adminRequest<{ data: Coupon }>(`/coupons/${item.id}/${item.active ? "deactivate" : "activate"}`, { method: "PATCH" });
      setCoupons((rows) => rows.map((row) => row.id === item.id ? result.data : row));
      setMessage({ kind: "ok", text: item.active ? "تم إيقاف الكوبون" : "تم تفعيل الكوبون" });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر تغيير حالة الكوبون" }); }
    finally { setWorking(null); }
  }

  function editOffer(item?: Offer) {
    if (!item) { setEditingOffer("new"); setOffer(blankOffer); return; }
    setEditingOffer(item.id); setOffer({ title: item.title, description: item.description || "", price: String(item.price), currency: item.currency, status: item.status, startDate: dateValue(item.startDate), endDate: dateValue(item.endDate) });
  }
  async function saveOffer(event: React.FormEvent) {
    event.preventDefault(); setWorking("offer"); setMessage(null);
    const body = { ...offer, price: Number(offer.price), description: offer.description || null, startDate: offer.startDate ? new Date(offer.startDate).toISOString() : undefined, endDate: offer.endDate ? new Date(offer.endDate).toISOString() : undefined };
    try {
      const result = editingOffer === "new" ? await adminRequest<{ data: Offer }>("/offers", { method: "POST", body: JSON.stringify(body) }) : await adminRequest<{ data: Offer }>(`/offers/${editingOffer}`, { method: "PATCH", body: JSON.stringify(body) });
      setOffers((rows) => editingOffer === "new" ? [result.data, ...rows] : rows.map((row) => row.id === editingOffer ? result.data : row));
      setEditingOffer(null); setMessage({ kind: "ok", text: "تم حفظ العرض" });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "تعذر حفظ العرض" }); }
    finally { setWorking(null); }
  }

  const tabs: { key: Tab; label: string; icon: typeof Package }[] = [{ key: "packages", label: "أسعار الباقات", icon: Package }, { key: "coupons", label: "الكوبونات والخصومات", icon: Tags }, { key: "offers", label: "العروض", icon: Percent }];
  return <section className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6 lg:px-10">
    <div className="grid gap-2 rounded-2xl border border-border bg-card p-2 sm:grid-cols-3">{tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Icon className="size-4" />{label}</button>)}</div>
    {message ? <div className={`rounded-2xl border p-4 text-sm font-bold ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>{message.kind === "ok" ? <Check className="me-2 inline size-4" /> : null}{message.text}</div> : null}

    {tab === "packages" ? <div className="space-y-5"><form onSubmit={saveRates} className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><h2 className="text-xl font-black">أسعار السوق الموازي اليوم</h2><p className="mt-1 text-sm text-muted-foreground">أدخل قيمة العملة الواحدة بالجنيه السوداني. الجنيه السوداني ثابت بقيمة 1.</p><div className="mt-5 grid gap-4 md:grid-cols-3"><RateField code="USD" label="الدولار الأمريكي" value={rates.USD} onChange={(value) => setRates((current) => ({ ...current, USD: value }))} /><RateField code="SAR" label="الريال السعودي" value={rates.SAR} onChange={(value) => setRates((current) => ({ ...current, SAR: value }))} /><div className="rounded-2xl border border-border bg-muted/40 p-4"><p className="text-sm font-black">الجنيه السوداني (SDG)</p><p className="mt-3 text-2xl font-black">1 SDG</p></div></div><Button type="submit" variant="gold" className="mt-5" disabled={working === "rates"}>{working === "rates" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}حفظ سعر اليوم</Button></form><div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><h2 className="text-xl font-black">أسعار الباقات</h2><p className="mt-1 text-sm text-muted-foreground">حدد السعر وعملته؛ سيظهر للعميل السعر الأصلي ومعادله بالجنيه السوداني.</p><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-3 text-start">الباقة</th><th className="px-3 py-3 text-start">السعر والعملة</th><th className="px-3 py-3 text-start">الحالة</th><th className="px-3 py-3 text-start">الكوبون</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="p-10 text-center">جاري التحميل...</td></tr> : null}{!loading && packages.length === 0 ? <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">لا توجد باقات مصنفة.</td></tr> : null}{packages.map((item) => <PackagePriceEditor key={`${item.id}-${item.basePrice}-${item.currency}`} item={item} working={working === item.id} rates={rates} onSave={(price, currency) => savePrice(item, price, currency)} onCoupon={() => editCoupon(undefined, item.id)} />)}</tbody></table></div><div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">تعديل السعر يؤثر على الطلبات الجديدة فقط؛ الطلبات السابقة تحتفظ بسعرها التاريخي.</div></div></div> : null}

    {tab === "coupons" ? <div className="space-y-5"><div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">الكوبونات والخصومات</h2><p className="mt-1 text-sm text-muted-foreground">اربط الكوبون بباقة واحدة أو اجعله صالحًا لجميع الباقات.</p></div><Button type="button" variant="gold" onClick={() => editCoupon()}><Plus className="size-4" />كوبون جديد</Button></div>{editingCoupon ? <CouponForm value={coupon} setValue={setCoupon} packages={packages} isNew={editingCoupon === "new"} working={working === "coupon"} onSubmit={saveCoupon} onClose={() => setEditingCoupon(null)} /> : null}</div><div className="grid gap-3 lg:grid-cols-2">{coupons.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><strong className="font-mono text-lg">{item.code}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{item.active ? "فعال" : "متوقف"}</span></div><p className="mt-2 font-black text-primary">خصم {Number(item.discountValue).toLocaleString("en-US")}{item.discountType === "PERCENTAGE" ? "%" : " مبلغ ثابت"}</p><p className="mt-1 text-sm text-muted-foreground">{item.service?.name || "جميع الباقات"} · استُخدم {item._count?.usages || 0} مرة</p></div><Button type="button" size="sm" variant="outline" onClick={() => editCoupon(item)}><Edit3 className="size-3" />تعديل</Button></div><Button type="button" size="sm" variant={item.active ? "outline" : "primary"} className="mt-4" disabled={working === item.id} onClick={() => void toggleCoupon(item)}>{item.active ? "إيقاف" : "تفعيل"}</Button></article>)}</div></div> : null}

    {tab === "offers" ? <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">العروض</h2><p className="mt-1 text-sm text-muted-foreground">العرض محتوى تسويقي؛ الكوبون هو الذي يطبّق الخصم فعليًا.</p></div><Button type="button" variant="gold" onClick={() => editOffer()}><Plus className="size-4" />عرض جديد</Button></div>{editingOffer ? <OfferForm value={offer} setValue={setOffer} working={working === "offer"} onSubmit={saveOffer} onClose={() => setEditingOffer(null)} /> : null}<div className="mt-5 grid gap-3 md:grid-cols-2">{offers.map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl border border-border p-4"><div><strong>{item.title}</strong><p className="text-sm text-muted-foreground">{Number(item.price).toLocaleString("en-US")} {item.currency} · {item.status}</p></div><Button type="button" size="sm" variant="outline" onClick={() => editOffer(item)}><Edit3 className="size-3" />تعديل</Button></div>)}</div></div> : null}
  </section>;
}

function RateField({ code, label, value, onChange }: { code: "USD" | "SAR"; label: string; value: number; onChange: (value: number) => void }) {
  return <label className="rounded-2xl border border-border bg-muted/40 p-4 text-sm font-black">{label} ({code})<span className="mt-3 flex items-center gap-2"><span>1 {code} =</span><input required type="number" min="0.01" step="0.01" value={value || ""} onChange={(event) => onChange(Number(event.target.value))} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-base" /><span>SDG</span></span></label>;
}

function PackagePriceEditor({ item, working, rates, onSave, onCoupon }: { item: PackageRow; working: boolean; rates: CurrencyRates; onSave: (price: string, currency: string) => Promise<void>; onCoupon: () => void }) {
  const [price, setPrice] = React.useState(String(item.basePrice));
  const [currency, setCurrency] = React.useState(item.currency);
  const rate = currency === "SDG" ? 1 : rates[currency as keyof CurrencyRates] || 0;
  const equivalent = Number(price) * rate;
  const changed = price !== String(item.basePrice) || currency !== item.currency;
  return <tr className="border-b border-border/70"><td className="px-3 py-4"><strong>{item.name}</strong><p className="text-xs text-muted-foreground">{item.code}</p></td><td className="px-3 py-4"><div className="flex flex-wrap items-center gap-2"><input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="0" step="0.01" className="h-10 w-36 rounded-lg border border-border bg-background px-3 font-bold" /><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 font-bold">{currencies.map((option) => <option key={option.code} value={option.code}>{option.code} — {option.label}</option>)}</select>{changed ? <Button type="button" size="sm" onClick={() => void onSave(price, currency)} disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}حفظ</Button> : null}</div>{currency !== "SDG" && equivalent > 0 ? <p className="mt-2 text-xs font-bold text-primary">يعادل {Math.round(equivalent).toLocaleString("en-US")} جنيه سوداني</p> : null}</td><td className="px-3 py-4">{item.active ? "نشطة" : "غير نشطة"}</td><td className="px-3 py-4"><Button type="button" size="sm" variant="outline" onClick={onCoupon}><Plus className="size-3" />إنشاء خصم</Button></td></tr>;
}

function CouponForm({ value, setValue, packages, isNew, working, onSubmit, onClose }: { value: CouponDraft; setValue: React.Dispatch<React.SetStateAction<CouponDraft>>; packages: PackageRow[]; isNew: boolean; working: boolean; onSubmit: (event: React.FormEvent) => void; onClose: () => void }) {
  const field = "mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal";
  return <form onSubmit={onSubmit} className="mt-5 grid gap-4 rounded-2xl bg-muted/50 p-4 md:grid-cols-2"><div className="flex items-center justify-between md:col-span-2"><strong>{isNew ? "إنشاء كوبون" : "تعديل الكوبون"}</strong><button type="button" onClick={onClose}><X className="size-4" /></button></div><label className="text-sm font-bold">الرمز<input required minLength={3} disabled={!isNew} value={value.code} onChange={(e) => setValue({ ...value, code: e.target.value.toUpperCase() })} className={`${field} font-mono uppercase disabled:opacity-60`} placeholder="NASAEM10" /></label><label className="text-sm font-bold">الباقة<select value={value.serviceId} onChange={(e) => setValue({ ...value, serviceId: e.target.value })} className={field}><option value="">جميع الباقات</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-bold">نوع الخصم<select value={value.discountType} onChange={(e) => setValue({ ...value, discountType: e.target.value as Coupon["discountType"] })} className={field}><option value="PERCENTAGE">نسبة مئوية</option><option value="FIXED">مبلغ ثابت</option></select></label><label className="text-sm font-bold">قيمة الخصم<input required type="number" min="0.01" max={value.discountType === "PERCENTAGE" ? 100 : undefined} step="0.01" value={value.discountValue} onChange={(e) => setValue({ ...value, discountValue: e.target.value })} className={field} /></label><label className="text-sm font-bold">الحد الأدنى للطلب<input type="number" min="0" step="0.01" value={value.minOrderAmount} onChange={(e) => setValue({ ...value, minOrderAmount: e.target.value })} className={field} placeholder="بدون حد" /></label><label className="text-sm font-bold">إجمالي الاستخدام<input type="number" min="1" value={value.usageLimit} onChange={(e) => setValue({ ...value, usageLimit: e.target.value })} className={field} placeholder="غير محدود" /></label><label className="text-sm font-bold">لكل عميل<input type="number" min="1" value={value.usageLimitPerCustomer} onChange={(e) => setValue({ ...value, usageLimitPerCustomer: e.target.value })} className={field} placeholder="غير محدود" /></label><label className="text-sm font-bold">البداية<input type="datetime-local" value={value.startDate} onChange={(e) => setValue({ ...value, startDate: e.target.value })} className={field} /></label><label className="text-sm font-bold">الانتهاء<input type="datetime-local" value={value.expiryDate} onChange={(e) => setValue({ ...value, expiryDate: e.target.value })} className={field} /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={value.active} onChange={(e) => setValue({ ...value, active: e.target.checked })} />تفعيل فور الحفظ</label><label className="text-sm font-bold md:col-span-2">الوصف<textarea value={value.description} onChange={(e) => setValue({ ...value, description: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label><Button type="submit" disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}حفظ الكوبون</Button></form>;
}

function OfferForm({ value, setValue, working, onSubmit, onClose }: { value: OfferDraft; setValue: React.Dispatch<React.SetStateAction<OfferDraft>>; working: boolean; onSubmit: (event: React.FormEvent) => void; onClose: () => void }) {
  const field = "mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal";
  return <form onSubmit={onSubmit} className="mt-5 grid gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-2"><div className="flex items-center justify-between sm:col-span-2"><strong>بيانات العرض</strong><button type="button" onClick={onClose}><X className="size-4" /></button></div><label className="text-sm font-bold">العنوان<input required value={value.title} onChange={(e) => setValue({ ...value, title: e.target.value })} className={field} /></label><label className="text-sm font-bold">السعر<input required type="number" min="0" step="0.01" value={value.price} onChange={(e) => setValue({ ...value, price: e.target.value })} className={field} /></label><label className="text-sm font-bold">الحالة<select value={value.status} onChange={(e) => setValue({ ...value, status: e.target.value as Offer["status"] })} className={field}><option value="DRAFT">مسودة</option><option value="ACTIVE">نشط</option><option value="ARCHIVED">مؤرشف</option></select></label><label className="text-sm font-bold">البداية<input type="datetime-local" value={value.startDate} onChange={(e) => setValue({ ...value, startDate: e.target.value })} className={field} /></label><label className="text-sm font-bold">النهاية<input type="datetime-local" value={value.endDate} onChange={(e) => setValue({ ...value, endDate: e.target.value })} className={field} /></label><label className="text-sm font-bold sm:col-span-2">الوصف<textarea value={value.description} onChange={(e) => setValue({ ...value, description: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label><Button type="submit" disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}حفظ العرض</Button></form>;
}

