"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

// Mirrors backend/src/modules/contact-requests/contact-requests.service.js's
// UMRAH_PACKAGE_PRICES_SAR — used here only to preview the price before
// submitting; the server recomputes it from the same map and never trusts a
// client-supplied amount.
const PACKAGE_PRICES_SAR: Record<string, number> = {
  "تأشيرة عمرة فقط": 1200,
  "عمرة مع الخدمات": 4500,
  "العمرة الجماعية (الأفواج)": 3800,
};
const PACKAGE_OPTIONS = Object.keys(PACKAGE_PRICES_SAR);

type PaymentInfo = {
  sarToSdgRate: number | null;
  bankAccounts: { SAR: string | null; SDG: string | null };
};

type Step = "fill" | "review" | "result";

type SubmitResult = {
  id: string;
  referenceNumber: string;
  currency: "SAR" | "SDG" | null;
  paymentAmount: number | null;
  paymentStatus: "NOT_REQUIRED" | "AWAITING_TRANSFER" | "UNDER_REVIEW" | "CONFIRMED";
  bankAccount: string | null;
};

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary";

export function UmrahRequestForm({ id }: { id?: string }) {
  const [step, setStep] = React.useState<Step>("fill");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [paymentInfo, setPaymentInfo] = React.useState<PaymentInfo | null>(null);
  const [passportFile, setPassportFile] = React.useState<File | null>(null);
  const [passportScanStatus, setPassportScanStatus] = React.useState<
    "idle" | "scanning" | "found" | "not-found"
  >("idle");
  const [nameSuggested, setNameSuggested] = React.useState(false);
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const [receiptStatus, setReceiptStatus] = React.useState<"idle" | "uploading" | "done" | "error">("idle");

  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    email: "",
    packageType: PACKAGE_OPTIONS[0],
    travelDate: "",
    pilgrims: "1",
    fullNameArabic: "",
    passportNumber: "",
    guarantorName: "",
    guarantorId: "",
    guarantorPhone: "",
    currency: "SAR" as "SAR" | "SDG",
    message: "",
  });

  React.useEffect(() => {
    fetch(`${API_URL}/settings/payment-info`)
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.data) setPaymentInfo(payload.data);
      })
      .catch(() => {
        // Payment instructions simply won't preview a rate/account — the
        // request can still be submitted, so this is not fatal.
      });
  }, []);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePassportFile(file: File | null) {
    setPassportFile(file);
    if (!file) {
      setPassportScanStatus("idle");
      return;
    }

    setPassportScanStatus("scanning");
    setNameSuggested(false);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch(`${API_URL}/contact-requests/passport-scan`, {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.data?.documentNumber) {
        updateField("passportNumber", payload.data.documentNumber);
      }

      // Never overwrite something the customer already typed — this is an
      // unverified OCR guess, only ever a starting point to review/edit.
      if (response.ok && payload?.data?.suggestedFullNameArabic) {
        setForm((prev) =>
          prev.fullNameArabic ? prev : { ...prev, fullNameArabic: payload.data.suggestedFullNameArabic }
        );
        setNameSuggested(true);
      }

      setPassportScanStatus(response.ok && (payload?.data?.documentNumber || payload?.data?.suggestedFullNameArabic) ? "found" : "not-found");
    } catch {
      setPassportScanStatus("not-found");
    }
  }

  function goToReview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("review");
  }

  async function handleConfirmSubmit() {
    setSubmitting(true);
    setError("");

    const details: Record<string, string> = {
      "نوع الباقة": form.packageType,
      "عدد المعتمرين": form.pilgrims,
      "الاسم الرباعي بالعربي": form.fullNameArabic,
      "اسم الضامن": form.guarantorName,
      "هوية الضامن (رقم سعودي)": form.guarantorId,
      "رقم هاتف الضامن": form.guarantorPhone,
    };
    if (form.travelDate) details["تاريخ السفر المتوقع"] = form.travelDate;
    if (form.passportNumber) details["رقم جواز السفر"] = form.passportNumber;

    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          service: "عمرة",
          message: form.message,
          details,
          currency: form.currency,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "تعذّر إرسال طلبك، حاول مرة أخرى");
      }

      const submitResult: SubmitResult = payload.data;

      if (passportFile) {
        const body = new FormData();
        body.append("image", passportFile);
        await fetch(`${API_URL}/contact-requests/${submitResult.id}/passport-image`, {
          method: "POST",
          body,
        }).catch(() => null);
      }

      setResult(submitResult);
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال طلبك، حاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReceiptUpload(file: File | null) {
    if (!file || !result) return;
    setReceiptStatus("uploading");
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch(`${API_URL}/contact-requests/${result.id}/payment-receipt`, {
        method: "POST",
        body,
      });
      if (!response.ok) throw new Error();
      setReceiptStatus("done");
    } catch {
      setReceiptStatus("error");
    }
  }

  const previewPriceSar = PACKAGE_PRICES_SAR[form.packageType];
  const previewPrice =
    form.currency === "SAR"
      ? previewPriceSar
      : paymentInfo?.sarToSdgRate
        ? Math.round(previewPriceSar * paymentInfo.sarToSdgRate * 100) / 100
        : null;
  const sdgAvailable = Boolean(paymentInfo?.sarToSdgRate);

  if (step === "result" && result) {
    return (
      <div id={id} className="scroll-mt-28 rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="size-12 text-success" />
          <h3 className="mt-4 text-lg font-bold text-foreground">تم استلام طلبك بنجاح</h3>
          <p className="mt-2 text-sm text-muted-foreground">احتفظ برقمك المرجعي لمتابعة طلبك:</p>
          <p dir="ltr" className="mt-2 rounded-xl bg-primary/10 px-5 py-2 text-xl font-extrabold text-primary dark:text-secondary">
            {result.referenceNumber}
          </p>
        </div>

        {result.paymentStatus === "AWAITING_TRANSFER" ? (
          <div className="mt-8 border-t border-border pt-6">
            <h4 className="text-sm font-bold text-foreground">إتمام الدفع</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              حوّل مبلغ{" "}
              <strong className="text-foreground">
                {result.paymentAmount} {CURRENCY_LABELS[result.currency ?? "SAR"]}
              </strong>{" "}
              إلى الحساب التالي، ثم ارفع صورة إشعار التحويل ليتم تأكيد الدفع:
            </p>
            <p className="mt-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground">
              {result.bankAccount || "يرجى التواصل معنا عبر واتساب للحصول على تفاصيل الحساب البنكي"}
            </p>

            {receiptStatus === "done" ? (
              <p className="mt-4 rounded-xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
                تم استلام إشعار التحويل، سيقوم فريقنا بمراجعته وتأكيد الدفع.
              </p>
            ) : (
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm font-semibold text-foreground/80 hover:border-primary">
                <Upload className="size-5" />
                {receiptStatus === "uploading" ? "جارٍ الرفع..." : "ارفع صورة إشعار التحويل"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={receiptStatus === "uploading"}
                  onChange={(e) => handleReceiptUpload(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {receiptStatus === "error" ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">تعذّر رفع الإشعار، حاول مرة أخرى.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "review") {
    const rows: [string, string][] = [
      ["الاسم الكامل", form.name],
      ["رقم الهاتف", form.phone],
      ["نوع الباقة", form.packageType],
      ["تاريخ السفر المتوقع", form.travelDate || "-"],
      ["عدد المعتمرين", form.pilgrims],
      ["الاسم الرباعي بالعربي", form.fullNameArabic],
      ["رقم جواز السفر", form.passportNumber || "لم يُقرأ تلقائيًا"],
      ["اسم الضامن", form.guarantorName],
      ["هوية الضامن", form.guarantorId],
      ["رقم هاتف الضامن", form.guarantorPhone],
      ["طريقة الدفع", CURRENCY_LABELS[form.currency]],
      ["المبلغ المستحق", previewPrice != null ? `${previewPrice} ${CURRENCY_LABELS[form.currency]}` : "-"],
    ];

    return (
      <div id={id} className="scroll-mt-28 rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
        <h3 className="text-lg font-bold text-foreground">تأكيد بيانات الطلب</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">راجع بياناتك قبل الإرسال النهائي.</p>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-background px-4 py-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setStep("fill")} disabled={submitting}>
            تعديل البيانات
          </Button>
          <Button type="button" variant="gold" size="lg" className="w-full" onClick={handleConfirmSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {submitting ? "جارٍ الإرسال..." : "تأكيد وإرسال الطلب"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      id={id}
      onSubmit={goToReview}
      className="scroll-mt-28 rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8"
    >
      {error ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="الاسم الكامل">
          <input required value={form.name} onChange={(e) => updateField("name", e.target.value)} className={fieldClass} />
        </Field>
        <Field label="رقم الهاتف">
          <input
            required
            type="tel"
            dir="ltr"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            className={`${fieldClass} text-end`}
            placeholder="+249 9XX XXX XXX"
          />
        </Field>

        <Field label="نوع الباقة">
          <select value={form.packageType} onChange={(e) => updateField("packageType", e.target.value)} className={fieldClass}>
            {PACKAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} — {PACKAGE_PRICES_SAR[option]} ريال
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ السفر المتوقع">
          <input type="date" value={form.travelDate} onChange={(e) => updateField("travelDate", e.target.value)} className={fieldClass} />
        </Field>
        <Field label="عدد المعتمرين">
          <input
            type="number"
            min={1}
            value={form.pilgrims}
            onChange={(e) => updateField("pilgrims", e.target.value)}
            className={fieldClass}
          />
        </Field>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm font-semibold text-foreground">صورة جواز السفر</label>
          <input
            required
            type="file"
            accept="image/*"
            onChange={(e) => handlePassportFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {passportScanStatus === "scanning" ? (
            <p className="text-xs text-muted-foreground">جارٍ قراءة الجواز تلقائيًا...</p>
          ) : null}
          {passportScanStatus === "not-found" ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              تعذّرت القراءة التلقائية، يرجى إدخال البيانات يدويًا أدناه.
            </p>
          ) : null}
        </div>

        <Field label="الاسم الرباعي بالعربي">
          <input
            required
            value={form.fullNameArabic}
            onChange={(e) => {
              setNameSuggested(false);
              updateField("fullNameArabic", e.target.value);
            }}
            className={fieldClass}
            placeholder="الاسم كاملًا كما في جواز السفر"
          />
          {nameSuggested ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              اسم مقترح تلقائيًا من صورة الجواز — يرجى مراجعته وتصحيحه إذا لزم الأمر.
            </p>
          ) : null}
        </Field>
        <Field label="رقم جواز السفر">
          <input
            required
            value={form.passportNumber}
            onChange={(e) => updateField("passportNumber", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>

        <Field label="اسم الضامن">
          <input required value={form.guarantorName} onChange={(e) => updateField("guarantorName", e.target.value)} className={fieldClass} />
        </Field>
        <Field label="هوية الضامن (رقم سعودي)">
          <input
            required
            value={form.guarantorId}
            onChange={(e) => updateField("guarantorId", e.target.value)}
            className={fieldClass}
            dir="ltr"
          />
        </Field>
        <Field label="رقم هاتف الضامن">
          <input
            required
            type="tel"
            dir="ltr"
            value={form.guarantorPhone}
            onChange={(e) => updateField("guarantorPhone", e.target.value)}
            className={`${fieldClass} text-end`}
          />
        </Field>

        <Field label="طريقة الدفع">
          <select value={form.currency} onChange={(e) => updateField("currency", e.target.value as "SAR" | "SDG")} className={fieldClass}>
            <option value="SAR">ريال سعودي</option>
            <option value="SDG" disabled={!sdgAvailable}>
              جنيه سوداني{!sdgAvailable ? " (غير متاح حاليًا)" : ""}
            </option>
          </select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">المبلغ المستحق (تقديري)</span>
          <div className={`${fieldClass} flex items-center bg-background/60 text-muted-foreground`}>
            {previewPrice != null ? `${previewPrice} ${CURRENCY_LABELS[form.currency]}` : "-"}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm font-semibold text-foreground">
            ملاحظات إضافية <span className="font-normal text-muted-foreground">(اختياري)</span>
          </label>
          <textarea
            rows={3}
            value={form.message}
            onChange={(e) => updateField("message", e.target.value)}
            className="resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
          />
        </div>
      </div>

      <Button type="submit" variant="gold" size="lg" className="mt-6 w-full">
        متابعة لمراجعة الطلب
      </Button>
    </form>
  );
}

const CURRENCY_LABELS: Record<string, string> = { SAR: "ريال سعودي", SDG: "جنيه سوداني" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}
