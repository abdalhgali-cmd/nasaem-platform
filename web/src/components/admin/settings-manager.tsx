"use client";

import * as React from "react";
import { Check, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminRequest } from "@/lib/admin-api";

const settingFields = [
  { key: "CONTACT_PHONE", label: "هاتف التواصل", group: "التواصل" },
  { key: "CONTACT_EMAIL", label: "البريد العام", group: "التواصل" },
  { key: "CONTACT_ADDRESS", label: "العنوان", group: "التواصل" },
  { key: "WHATSAPP_NUMBER", label: "رقم WhatsApp", group: "التواصل" },
  { key: "INSTAGRAM_URL", label: "Instagram", group: "الشبكات الاجتماعية" },
  { key: "FACEBOOK_URL", label: "Facebook", group: "الشبكات الاجتماعية" },
  { key: "X_URL", label: "X / Twitter", group: "الشبكات الاجتماعية" },
  { key: "SEO_TITLE", label: "عنوان SEO", group: "SEO" },
  { key: "SEO_DESCRIPTION", label: "وصف SEO", group: "SEO" },
] as const;
type SettingMap = Record<(typeof settingFields)[number]["key"], string>;

export function SettingsManager() {
  const [values, setValues] = React.useState<SettingMap>(() => Object.fromEntries(settingFields.map((field) => [field.key, ""])) as SettingMap);
  const [loading, setLoading] = React.useState(true); const [working, setWorking] = React.useState(false); const [error, setError] = React.useState(""); const [success, setSuccess] = React.useState("");
  React.useEffect(() => { adminRequest<{ data: Array<{ key: string; value: string }> }>("/settings").then((payload) => { setValues((current) => { const next = { ...current }; for (const item of payload.data || []) if (item.key in next) next[item.key as keyof SettingMap] = item.value; return next; }); }).catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل الإعدادات")).finally(() => setLoading(false)); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); setWorking(true); setError(""); setSuccess(""); try { for (const field of settingFields) await adminRequest(`/settings`, { method: "POST", body: JSON.stringify({ key: field.key, value: values[field.key] }) }); setSuccess("تم حفظ إعدادات التواصل وSEO"); } catch (err) { setError(err instanceof Error ? err.message : "تعذر حفظ الإعدادات"); } finally { setWorking(false); } }
  return <section className="mx-auto max-w-5xl space-y-5 px-4 py-7 sm:px-6 lg:px-10"><div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Settings className="size-5" /></div><div><h2 className="text-xl font-black">إعدادات الموقع</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">مفاتيح عامة محددة مسبقًا للتواصل والشبكات وSEO. لا تُحفظ كلمات مرور أو مفاتيح API أو إعدادات تشغيلية حساسة هنا.</p></div></div></div>{error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}{success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><Check className="me-2 inline size-4" />{success}</div> : null}<form onSubmit={save} className="space-y-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">{["التواصل", "الشبكات الاجتماعية", "SEO"].map((group) => <div key={group}><h3 className="border-b border-border pb-3 text-sm font-black">{group}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">{settingFields.filter((field) => field.group === group).map((field) => <label key={field.key} className="text-sm font-bold">{field.label}<input value={values[field.key]} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" dir={field.key.endsWith("URL") || field.key.includes("EMAIL") || field.key.includes("PHONE") || field.key.includes("NUMBER") ? "ltr" : "rtl"} /></label>)}</div></div>)}<Button type="submit" disabled={loading || working}>{working ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}حفظ الإعدادات</Button></form></section>;
}
