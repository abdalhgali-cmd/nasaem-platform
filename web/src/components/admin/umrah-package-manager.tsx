"use client";

/* eslint-disable react-hooks/set-state-in-effect -- initial data loading synchronizes with the API. */
/* eslint-disable @next/next/no-img-element -- public asset URLs are backend-managed and dynamic. */

import * as React from "react";
import { ArrowDown, ArrowUp, Check, Edit3, ImagePlus, Loader2, PackagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { adminRequest } from "@/lib/admin-api";

type PackageService = {
  id: string;
  code: string;
  name: string;
  category: string;
  description?: string | null;
  basePrice: string | number;
  currency: string;
  active: boolean;
  sortOrder: number;
  processingTime?: string | null;
  features?: string[] | null;
  imageKey?: string | null;
};

type PackageForm = {
  code: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  duration: string;
  hotel: string;
  nights: string;
  transport: string;
  visa: string;
  included: string;
  excluded: string;
  active: boolean;
};

const empty: PackageForm = {
  code: "",
  name: "",
  description: "",
  price: "0",
  currency: "SAR",
  duration: "",
  hotel: "",
  nights: "",
  transport: "",
  visa: "",
  included: "",
  excluded: "",
  active: true,
};

function readFeature(features: string[] | null | undefined, prefix: string) {
  return (features ?? []).find((feature) => feature.startsWith(`${prefix}:`))?.slice(prefix.length + 1).trim() ?? "";
}

function splitFeatures(features: string[] | null | undefined, prefix: string) {
  return (features ?? []).filter((feature) => feature.startsWith(`${prefix}:`)).map((feature) => feature.slice(prefix.length + 1).trim()).filter(Boolean).join("\n");
}

function formFromPackage(item: PackageService): PackageForm {
  return {
    code: item.code,
    name: item.name,
    description: item.description ?? "",
    price: String(item.basePrice),
    currency: item.currency,
    duration: readFeature(item.features, "DURATION") || item.processingTime || "",
    hotel: readFeature(item.features, "HOTEL"),
    nights: readFeature(item.features, "NIGHTS"),
    transport: readFeature(item.features, "TRANSPORT"),
    visa: readFeature(item.features, "VISA"),
    included: splitFeatures(item.features, "INCLUDED"),
    excluded: splitFeatures(item.features, "EXCLUDED"),
    active: item.active,
  };
}

function featuresFromForm(form: PackageForm) {
  return [
    form.duration && `DURATION: ${form.duration}`,
    form.hotel && `HOTEL: ${form.hotel}`,
    form.nights && `NIGHTS: ${form.nights}`,
    form.transport && `TRANSPORT: ${form.transport}`,
    form.visa && `VISA: ${form.visa}`,
    ...form.included.split("\n").map((value) => value.trim()).filter(Boolean).map((value) => `INCLUDED: ${value}`),
    ...form.excluded.split("\n").map((value) => value.trim()).filter(Boolean).map((value) => `EXCLUDED: ${value}`),
  ].filter(Boolean);
}

function assetUrl(key: string | null | undefined) {
  return key ? `${API_URL}/site-assets/${encodeURIComponent(key)}/file` : null;
}

export function UmrahPackageManager() {
  const [packages, setPackages] = React.useState<PackageService[]>([]);
  const [form, setForm] = React.useState<PackageForm>(empty);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await adminRequest<{ data: PackageService[] }>("/services?category=UMRAH_PACKAGE&limit=100");
      setPackages((payload.data || []).filter((item) => item.category === "UMRAH_PACKAGE").sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل باقات العمرة");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void load(); }, []);

  function reset() {
    setEditingId(null);
    setForm(empty);
  }

  function startEdit(item: PackageService) {
    setEditingId(item.id);
    setForm(formFromPackage(item));
    setError("");
    setSuccess("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setSuccess("");
    try {
      const body = JSON.stringify({
        code: form.code,
        name: form.name,
        category: "UMRAH_PACKAGE",
        description: form.description || null,
        basePrice: Number(form.price),
        currency: form.currency,
        active: form.active,
        features: featuresFromForm(form),
        processingTime: form.duration || null,
      });
      const payload = editingId
        ? await adminRequest<{ data: PackageService }>(`/services/${editingId}`, { method: "PATCH", body })
        : await adminRequest<{ data: PackageService }>("/services", { method: "POST", body });
      setPackages((current) => {
        const next = editingId ? current.map((item) => item.id === editingId ? payload.data : item) : [...current, payload.data];
        return next.sort((a, b) => a.sortOrder - b.sortOrder);
      });
      setSuccess(editingId ? "تم تحديث باقة العمرة" : "تم إنشاء باقة العمرة ضمن Service الحالية");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الباقة");
    } finally {
      setWorking(false);
    }
  }

  async function uploadImage(item: PackageService, file: File) {
    setWorking(true);
    setError("");
    const body = new FormData();
    body.append("image", file);
    try {
      const response = await fetch(`${API_URL}/services/${item.id}/image`, { method: "POST", credentials: "include", body });
      const payload = await response.json().catch(() => null) as { success?: boolean; data?: PackageService; message?: string } | null;
      if (!response.ok || !payload?.success || !payload.data) throw new Error(payload?.message || "تعذر رفع صورة الباقة");
      setPackages((current) => current.map((entry) => entry.id === item.id ? payload.data! : entry));
      setSuccess("تم تحديث صورة الباقة");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفع صورة الباقة");
    } finally {
      setWorking(false);
    }
  }

  async function move(item: PackageService, direction: -1 | 1) {
    const index = packages.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= packages.length) return;
    const next = [...packages];
    [next[index], next[target]] = [next[target], next[index]];
    setWorking(true);
    setError("");
    try {
      await adminRequest("/services/reorder", { method: "PATCH", body: JSON.stringify({ order: next.map((entry) => entry.id) }) });
      setPackages(next.map((entry, position) => ({ ...entry, sortOrder: position })));
      setSuccess("تم تحديث ترتيب الباقات");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث ترتيب الباقات");
    } finally {
      setWorking(false);
    }
  }

  return <section className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
    <div className="flex items-start gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-accent/20 text-accent-foreground"><PackagePlus className="size-5" /></div><div><h2 className="text-xl font-black">باقات العمرة</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">تُحفظ الباقة كخدمة من فئة <span className="font-mono" dir="ltr">UMRAH_PACKAGE</span>؛ لذلك تستفيد من السعر والظهور والميزات والصور والترتيب الموجودة دون Package model مكرر.</p></div></div>
    {error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}
    {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><Check className="me-2 inline size-4" />{success}</div> : null}
    <form onSubmit={save} className="grid gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between"><h3 className="font-black">{editingId ? "تعديل الباقة" : "باقة جديدة"}</h3>{editingId ? <button type="button" aria-label="إلغاء تعديل الباقة" onClick={reset}><X className="size-4" /></button> : null}</div>
      <label className="text-sm font-bold">رمز الباقة<input required placeholder="umrah-economy-2026" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" dir="ltr" /></label>
      <label className="text-sm font-bold">اسم الباقة<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">السعر<input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">المدة<input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="10 أيام" className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">الفندق<input value={form.hotel} onChange={(e) => setForm({ ...form, hotel: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">عدد الليالي<input value={form.nights} onChange={(e) => setForm({ ...form, nights: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">النقل<input value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">التأشيرة<input value={form.visa} onChange={(e) => setForm({ ...form, visa: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label>
      <label className="text-sm font-bold">العملة<select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 font-normal"><option value="SAR">SAR</option><option value="USD">USD</option><option value="AED">AED</option><option value="EUR">EUR</option></select></label>
      <label className="flex items-center gap-2 self-end text-sm font-bold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />ظاهرة للعملاء</label>
      <label className="sm:col-span-2 lg:col-span-3 text-sm font-bold">الوصف<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label>
      <label className="text-sm font-bold">الخدمات المشمولة<textarea placeholder="سطر لكل خدمة" value={form.included} onChange={(e) => setForm({ ...form, included: e.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label>
      <label className="text-sm font-bold">الخدمات غير المشمولة<textarea placeholder="سطر لكل خدمة" value={form.excluded} onChange={(e) => setForm({ ...form, excluded: e.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label>
      <div className="flex items-end gap-2"><Button type="submit" disabled={working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{editingId ? "حفظ التعديلات" : "حفظ الباقة"}</Button>{editingId ? <Button type="button" variant="outline" onClick={reset}>إلغاء</Button> : null}</div>
    </form>
    <div className="grid gap-3 md:grid-cols-2">
      {loading ? <p className="py-8 text-center text-muted-foreground">جاري التحميل...</p> : null}
      {!loading && packages.length === 0 ? <p className="py-8 text-center text-muted-foreground">لا توجد باقات بعد.</p> : null}
      {packages.map((item, index) => <div key={item.id} className="rounded-2xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.name}</p><p className="font-mono text-xs text-muted-foreground" dir="ltr">{item.code}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{Number(item.basePrice).toLocaleString("en-US")} {item.currency}</span></div>{item.imageKey && assetUrl(item.imageKey) ? <img src={assetUrl(item.imageKey)!} alt={item.name} className="mt-3 h-28 w-full rounded-xl object-cover" /> : null}<p className="mt-3 text-sm text-muted-foreground">{item.description || "بدون وصف"}</p><div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{item.active ? "نشطة" : "غير نشطة"}</span><Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)}><Edit3 className="size-3" />تعديل</Button><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-bold text-primary hover:bg-primary/10"><ImagePlus className="size-3" />صورة<input type="file" accept="image/*" className="sr-only" disabled={working} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadImage(item, file); e.currentTarget.value = ""; }} /></label><Button type="button" size="sm" variant="ghost" disabled={working || index === 0} aria-label={`رفع ${item.name}`} onClick={() => void move(item, -1)}><ArrowUp className="size-3" /></Button><Button type="button" size="sm" variant="ghost" disabled={working || index === packages.length - 1} aria-label={`خفض ${item.name}`} onClick={() => void move(item, 1)}><ArrowDown className="size-3" /></Button></div></div>)}
    </div>
  </section>;
}
