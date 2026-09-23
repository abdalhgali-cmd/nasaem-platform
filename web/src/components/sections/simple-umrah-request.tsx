"use client";

/* eslint-disable react-hooks/set-state-in-effect -- initial catalog load synchronizes with the public API. */

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { formatSdgEquivalent, hasPublishedPrice } from "@/lib/price";
import { siteConfig } from "@/lib/site-config";
import { cn } from "@/lib/utils";

type UmrahPackage = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: string;
  currency: string;
  priceSdg: number | null;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  travelerCount: string;
  travelDate: string;
  notes: string;
};

const initialForm: FormState = {
  name: "",
  phone: "",
  email: "",
  travelerCount: "1",
  travelDate: "",
  notes: "",
};

function isUmrahPackage(item: UmrahPackage) {
  return item.category === "UMRAH_PACKAGE" || item.code.startsWith("SVC-UMRAH-");
}

export function SimpleUmrahRequest({ initialServiceCode }: { initialServiceCode?: string }) {
  const [packages, setPackages] = React.useState<UmrahPackage[]>([]);
  const [selectedId, setSelectedId] = React.useState("");
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [requestId, setRequestId] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const loadPackages = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/services/public/packages`, { cache: "no-store" });
      const payload = (await response.json()) as {
        success?: boolean;
        data?: UmrahPackage[];
        message?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "تعذر تحميل باقات العمرة");
      }
      setPackages((payload.data ?? []).filter(isUmrahPackage));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل باقات العمرة");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const selectedPackage =
    packages.find((item) => item.id === selectedId) ??
    packages.find((item) => item.code === initialServiceCode);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedPackage) {
      setError("اختر باقة العمرة أولًا");
      return;
    }
    if (form.name.trim().length < 2 || form.phone.trim().length < 6) {
      setError("اكتب الاسم ورقم الهاتف حتى نتواصل معك");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          service: selectedPackage.name,
          message: form.notes.trim() || `طلب ${selectedPackage.name} عبر الموقع`,
          serviceId: selectedPackage.id,
          travelerCount: Number(form.travelerCount),
          intakeData: {
            travelDate: form.travelDate || undefined,
            notes: form.notes.trim() || undefined,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: { id?: string };
        message?: string;
      } | null;

      if (!response.ok || !payload?.success || !payload.data?.id) {
        throw new Error(payload?.message || "تعذر إرسال الطلب، حاول مرة أخرى");
      }
      setRequestId(payload.data.id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "تعذر إرسال الطلب، حاول مرة أخرى";
      setError(message === "Validation failed" ? "راجع الاسم ورقم الهاتف ثم حاول مرة أخرى" : message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRequestId() {
    await navigator.clipboard.writeText(requestId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (requestId) {
    return (
      <div className="mx-auto max-w-2xl rounded-[2rem] border border-emerald-200 bg-card p-6 text-center shadow-xl shadow-primary/5 sm:p-9">
        <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-black text-foreground">تم استلام طلب العمرة</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          سيؤكد فريق الوكالة الطلب، ثم يرسل لك السعر النهائي وخطوة الدفع.
        </p>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4 text-start">
          <div>
            <p className="text-xs font-bold text-muted-foreground">رقم الطلب</p>
            <p className="mt-1 font-mono text-sm font-black" dir="ltr">{requestId}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void copyRequestId()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "تم النسخ" : "نسخ"}
          </Button>
        </div>

        <div className="mt-5 rounded-2xl bg-primary/5 p-5 text-start">
          <p className="text-sm font-black text-foreground">ماذا سيحدث الآن؟</p>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1.</strong> الوكالة تؤكد استلام الطلب وترسل السعر النهائي.</li>
            <li><strong className="text-foreground">2.</strong> توافق على السعر وترفع إثبات الدفع.</li>
            <li><strong className="text-foreground">3.</strong> بعد قبول الدفع يبدأ انتظار إصدار التأشيرة.</li>
            <li><strong className="text-foreground">4.</strong> يرفع الموظف التأشيرة ويصلك إشعار بصدورها.</li>
          </ol>
        </div>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg"><Link href="/track">متابعة الطلب</Link></Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => {
              setRequestId("");
              setForm(initialForm);
            }}
          >
            طلب جديد
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl rounded-[2rem] border border-border bg-card p-5 shadow-xl shadow-primary/5 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <PackageCheck className="size-5" />
        </span>
        <div>
          <p className="text-xs font-bold text-primary dark:text-secondary">الخطوة الأولى</p>
          <h2 className="text-xl font-black text-foreground sm:text-2xl">اختر باقة العمرة</h2>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex min-h-28 items-center justify-center rounded-2xl bg-muted/40 text-sm text-muted-foreground">
          <Loader2 className="me-2 size-5 animate-spin" /> جاري تحميل الباقات...
        </div>
      ) : null}

      {!loading && packages.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-6 text-center">
          <p className="font-bold">لا توجد باقات منشورة حاليًا</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadPackages()}>
            <RefreshCw className="size-4" /> إعادة المحاولة
          </Button>
        </div>
      ) : null}

      {!loading && packages.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((item) => {
            const selected = selectedPackage?.id === item.id;
            const sdgPrice = formatSdgEquivalent(item.priceSdg);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedId(item.id);
                  setError("");
                }}
                className={cn(
                  "relative rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/15"
                    : "border-border bg-background hover:border-primary/40",
                )}
                aria-pressed={selected}
              >
                {selected ? (
                  <span className="absolute end-3 top-3 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" />
                  </span>
                ) : null}
                <p className="pe-8 font-black text-foreground">{item.name}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {item.description || "باقة عمرة متكاملة"}
                </p>
                <div className="mt-3">
                  {hasPublishedPrice(item.basePrice) ? (
                    <>
                      <p className="text-sm font-black text-primary dark:text-secondary">
                        {Number(item.basePrice).toLocaleString("en-US")} {item.currency}
                      </p>
                      {sdgPrice ? <p className="mt-0.5 text-xs text-muted-foreground">{sdgPrice}</p> : null}
                    </>
                  ) : (
                    <p className="text-xs font-bold text-muted-foreground">السعر بعد مراجعة الطلب</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedPackage ? (
        <form onSubmit={submitRequest} className="mt-8 border-t border-border pt-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-black text-accent-foreground">2</span>
            <div>
              <h3 className="font-black text-foreground">أدخل بيانات التواصل</h3>
              <p className="text-xs text-muted-foreground">لن نطلب الجواز أو الدفع الآن.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-foreground">
              الاسم الكامل <span className="text-destructive">*</span>
              <input
                required
                autoComplete="name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="اكتب اسمك"
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="text-sm font-bold text-foreground">
              رقم الهاتف <span className="text-destructive">*</span>
              <input
                required
                type="tel"
                autoComplete="tel"
                dir="ltr"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="0912345678"
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-end font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="text-sm font-bold text-foreground">
              <span className="flex items-center gap-1.5"><Users className="size-4" />عدد المسافرين</span>
              <input
                required
                type="number"
                min="1"
                max="50"
                value={form.travelerCount}
                onChange={(event) => updateField("travelerCount", event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="text-sm font-bold text-foreground">
              <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />تاريخ السفر <span className="font-normal text-muted-foreground">(اختياري)</span></span>
              <input
                type="date"
                value={form.travelDate}
                onChange={(event) => updateField("travelDate", event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
            <label className="text-sm font-bold text-foreground sm:col-span-2">
              البريد الإلكتروني <span className="font-normal text-muted-foreground">(اختياري)</span>
              <input
                type="email"
                autoComplete="email"
                dir="ltr"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="name@example.com"
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-end font-normal outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
          </div>

          <details className="mt-4 rounded-xl border border-border bg-muted/25 p-4">
            <summary className="cursor-pointer text-sm font-bold text-foreground">إضافة ملاحظة (اختياري)</summary>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="مثلاً: أحتاج غرفة ثلاثية أو لدي أطفال"
              className="mt-3 min-h-24 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </details>

          {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive">{error}</p> : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" variant="gold" size="lg" disabled={submitting} className="sm:min-w-56">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? "جاري إرسال الطلب..." : "إرسال طلب العمرة"}
            </Button>
            <a
              href={`https://wa.me/${siteConfig.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="size-4" /> تحتاج مساعدة؟ تواصل واتساب
            </a>
          </div>
        </form>
      ) : (
        !loading && packages.length > 0 ? (
          <p className="mt-6 rounded-xl bg-primary/5 p-4 text-center text-sm font-bold text-primary dark:text-secondary">
            اختر إحدى الباقات أعلاه لإكمال الطلب
          </p>
        ) : null
      )}
    </div>
  );
}
