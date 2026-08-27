"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial data loading synchronizes with the API. */

import * as React from "react";
import { Check, Flag, Loader2 } from "lucide-react";
import { adminRequest } from "@/lib/admin-api";

 type FeatureFlag = { key: string; enabled: boolean; description?: string | null; updatedAt: string };

export function FeatureFlagsManager() {
  const [flags, setFlags] = React.useState<FeatureFlag[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  async function load() { setLoading(true); setError(""); try { const payload = await adminRequest<{ data: FeatureFlag[] }>("/feature-flags"); setFlags(payload.data || []); } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحميل الخصائص"); } finally { setLoading(false); } }
  React.useEffect(() => { void load(); }, []);
  async function toggle(flag: FeatureFlag) { setWorking(flag.key); setError(""); setSuccess(""); try { const payload = await adminRequest<{ data: FeatureFlag }>(`/feature-flags/${encodeURIComponent(flag.key)}`, { method: "PATCH", body: JSON.stringify({ enabled: !flag.enabled }) }); setFlags((current) => current.map((item) => item.key === flag.key ? payload.data : item)); setSuccess("تم حفظ الخاصية وتطبيقها على الخادم"); } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحديث الخاصية"); } finally { setWorking(null); } }
  return <section className="mx-auto max-w-5xl space-y-5 px-4 py-7 sm:px-6 lg:px-10">{error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}{success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><Check className="me-2 inline size-4" />{success}</div> : null}<div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Flag className="size-5" /></div><div><h2 className="text-xl font-black">خصائص المنصة</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">المفاتيح محددة مسبقًا في الخادم. تغييرها هنا لا يضمنه إخفاء الواجهة فقط؛ المسارات الحساسة تعيد التحقق من الحالة عند كل طلب.</p></div></div></div><div className="grid gap-3">{loading ? <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">جاري تحميل الخصائص...</div> : null}{!loading && flags.length === 0 ? <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">لا توجد خصائص مزروعة.</div> : null}{flags.map((flag) => <div key={flag.key} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-sm font-bold" dir="ltr">{flag.key}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{flag.description || "خاصية تشغيلية مُدارة من الخادم"}</p></div><button type="button" disabled={working === flag.key} onClick={() => void toggle(flag)} className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${flag.enabled ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{working === flag.key ? <Loader2 className="size-4 animate-spin" /> : null}{flag.enabled ? "مفعّل" : "متوقف"}</button></div>)}</div></section>;
}
