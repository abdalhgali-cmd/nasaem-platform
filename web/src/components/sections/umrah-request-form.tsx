"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

// Mirrors backend/src/modules/contact-requests/contact-requests.service.js's
// UMRAH_PACKAGE_PRICES_SAR (price per person) and MAX_UMRAH_TRAVELERS —
// used here only to preview the price before submitting; the server
// recomputes it from the same map and never trusts a client-supplied
// amount.
const PACKAGE_PRICES_SAR: Record<string, number> = {
  "تأشيرة عمرة فقط": 1200,
  "عمرة مع الخدمات": 4500,
  "العمرة الجماعية (الأفواج)": 3800,
};
const PACKAGE_OPTIONS = Object.keys(PACKAGE_PRICES_SAR);
const MAX_TRAVELERS = 7;
const PEOPLE_COUNT_OPTIONS = Array.from({ length: MAX_TRAVELERS }, (_, i) => i + 1);

type PaymentInfo = {
  sarToSdgRate: number | null;
  usdToSdgRate: number | null;
  bankAccounts: { SAR: string | null; SDG: string | null; USD: string | null };
};

type Step = "fill" | "review" | "result";

type SubmitResult = {
  id: string;
  referenceNumber: string;
  currency: "SAR" | "SDG" | "USD" | null;
  paymentAmount: number | null;
  paymentStatus: "NOT_REQUIRED" | "AWAITING_TRANSFER" | "UNDER_REVIEW" | "CONFIRMED";
  bankAccount: string | null;
};

type PersonEntry = {
  passportFile: File | null;
  scanStatus: "idle" | "scanning" | "found" | "not-found";
  fullNameArabic: string;
  nameSuggested: boolean;
  guarantorName: string;
  guarantorId: string;
  guarantorPhone: string;
  guarantorIdFile: File | null;
};

function emptyPerson(): PersonEntry {
  return {
    passportFile: null,
    scanStatus: "idle",
    fullNameArabic: "",
    nameSuggested: false,
    guarantorName: "",
    guarantorId: "",
    guarantorPhone: "",
    guarantorIdFile: null,
  };
}

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary";

export function UmrahRequestForm({ id }: { id?: string }) {
  const [step, setStep] = React.useState<Step>("fill");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [paymentInfo, setPaymentInfo] = React.useState<PaymentInfo | null>(null);
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const [receiptStatus, setReceiptStatus] = React.useState<"idle" | "uploading" | "done" | "error">("idle");

  const [people, setPeople] = React.useState<PersonEntry[]>([emptyPerson()]);
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    email: "",
    packageType: PACKAGE_OPTIONS[0],
    travelDate: "",
    currency: "SAR" as "SAR" | "SDG" | "USD",
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

  function updatePerson(index: number, patch: Partial<PersonEntry>) {
    setPeople((prev) => prev.map((person, i) => (i === index ? { ...person, ...patch } : person)));
  }

  function handlePeopleCountChange(count: number) {
    setPeople((prev) => {
      if (count === prev.length) return prev;
      if (count < prev.length) return prev.slice(0, count);
      return [...prev, ...Array.from({ length: count - prev.length }, () => emptyPerson())];
    });
  }

  async function handlePersonPassportFile(index: number, file: File | null) {
    updatePerson(index, { passportFile: file, nameSuggested: false });
    if (!file) {
      updatePerson(index, { scanStatus: "idle" });
      return;
    }

    updatePerson(index, { scanStatus: "scanning" });
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch(`${API_URL}/contact-requests/passport-scan`, {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);
      const suggestedName: string | undefined = payload?.data?.suggestedFullNameArabic;

      if (response.ok && suggestedName) {
        // Never overwrite something the customer already typed — this is
        // an unverified OCR guess, only ever a starting point to review.
        setPeople((prev) =>
          prev.map((person, i) =>
            i === index && !person.fullNameArabic
              ? { ...person, fullNameArabic: suggestedName, nameSuggested: true, scanStatus: "found" }
              : i === index
                ? { ...person, scanStatus: "found" }
                : person
          )
        );
      } else {
        updatePerson(index, { scanStatus: response.ok ? "found" : "not-found" });
      }
    } catch {
      updatePerson(index, { scanStatus: "not-found" });
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
      "عدد الأشخاص": String(people.length),
    };
    if (form.travelDate) details["تاريخ السفر المتوقع"] = form.travelDate;

    people.forEach((person, i) => {
      const label = `الشخص ${i + 1}`;
      details[`${label} - الاسم بالعربي`] = person.fullNameArabic;
      details[`${label} - اسم الضامن`] = person.guarantorName;
      details[`${label} - هوية الضامن`] = person.guarantorId;
      details[`${label} - هاتف الضامن`] = person.guarantorPhone;
    });

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

      const passportFiles = people.map((p) => p.passportFile).filter((f): f is File => Boolean(f));
      if (passportFiles.length > 0) {
        const body = new FormData();
        passportFiles.forEach((file) => body.append("images", file));
        await fetch(`${API_URL}/contact-requests/${submitResult.id}/passport-image`, {
          method: "POST",
          body,
        }).catch(() => null);
      }

      const guarantorIdFiles = people.map((p) => p.guarantorIdFile).filter((f): f is File => Boolean(f));
      if (guarantorIdFiles.length > 0) {
        const body = new FormData();
        guarantorIdFiles.forEach((file) => body.append("images", file));
        await fetch(`${API_URL}/contact-requests/${submitResult.id}/guarantor-id-image`, {
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

  // Mirrors the backend's SDG-pivot conversion in resolvePayment(): SAR
  // needs no rate, SDG/USD are both quoted against SDG so USD needs both
  // rates set.
  const previewPriceSar = PACKAGE_PRICES_SAR[form.packageType] * people.length;
  const previewPriceSdg = paymentInfo?.sarToSdgRate ? previewPriceSar * paymentInfo.sarToSdgRate : null;
  const previewPrice = (() => {
    if (form.currency === "SAR") return previewPriceSar;
    if (form.currency === "SDG") return previewPriceSdg != null ? Math.round(previewPriceSdg * 100) / 100 : null;
    if (form.currency === "USD") {
      return previewPriceSdg != null && paymentInfo?.usdToSdgRate
        ? Math.round((previewPriceSdg / paymentInfo.usdToSdgRate) * 100) / 100
        : null;
    }
    return null;
  })();
  const sdgAvailable = Boolean(paymentInfo?.sarToSdgRate);
  const usdAvailable = Boolean(paymentInfo?.sarToSdgRate && paymentInfo?.usdToSdgRate);

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
    const commonRows: [string, string][] = [
      ["الاسم الكامل (مقدم الطلب)", form.name],
      ["رقم الهاتف", form.phone],
      ["نوع الباقة", form.packageType],
      ["تاريخ السفر المتوقع", form.travelDate || "-"],
      ["عدد الأشخاص", String(people.length)],
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

        <div className="mt-6 space-y-3">
          {people.map((person, i) => (
            <div key={i} className="rounded-xl bg-background px-4 py-3">
              <dt className="text-xs text-muted-foreground">الشخص {i + 1}</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {person.fullNameArabic} — جواز: {person.passportFile ? "تم الرفع" : "لم يُرفع"} — الضامن:{" "}
                {person.guarantorName} ({person.guarantorId}) — إقامة الضامن:{" "}
                {person.guarantorIdFile ? "تم الرفع" : "لم يُرفع"}
              </dd>
            </div>
          ))}
        </div>

        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {commonRows.map(([label, value]) => (
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

      <Field label="عدد الأشخاص">
        <select
          value={people.length}
          onChange={(e) => handlePeopleCountChange(Number(e.target.value))}
          className={fieldClass}
        >
          {PEOPLE_COUNT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </Field>

      <div className="mt-5 space-y-6">
        {people.map((person, i) => (
          <div key={i} className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <h4 className="text-sm font-bold text-foreground">بيانات الشخص {i + 1}</h4>

            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-foreground">صورة جواز السفر</label>
              <input
                required
                type="file"
                accept="image/*"
                onChange={(e) => handlePersonPassportFile(i, e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              {person.scanStatus === "scanning" ? (
                <p className="text-xs text-muted-foreground">جارٍ قراءة الجواز تلقائيًا...</p>
              ) : null}
              {person.scanStatus === "not-found" ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  تعذّرت القراءة التلقائية، يرجى إدخال الاسم يدويًا أدناه.
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-semibold text-foreground">الاسم الرباعي بالعربي</label>
                <input
                  required
                  value={person.fullNameArabic}
                  onChange={(e) => updatePerson(i, { fullNameArabic: e.target.value, nameSuggested: false })}
                  className={fieldClass}
                  placeholder="الاسم كاملًا كما في جواز السفر"
                />
                {person.nameSuggested ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    اسم مقترح تلقائيًا من صورة الجواز — يرجى مراجعته وتصحيحه إذا لزم الأمر.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-foreground">اسم الضامن</label>
                <input
                  required
                  value={person.guarantorName}
                  onChange={(e) => updatePerson(i, { guarantorName: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-foreground">هوية الضامن (رقم سعودي)</label>
                <input
                  required
                  value={person.guarantorId}
                  onChange={(e) => updatePerson(i, { guarantorId: e.target.value })}
                  className={fieldClass}
                  dir="ltr"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-foreground">رقم هاتف الضامن</label>
                <input
                  required
                  type="tel"
                  dir="ltr"
                  value={person.guarantorPhone}
                  onChange={(e) => updatePerson(i, { guarantorPhone: e.target.value })}
                  className={`${fieldClass} text-end`}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-semibold text-foreground">صورة إقامة الضامن</label>
                <input
                  required
                  type="file"
                  accept="image/*"
                  onChange={(e) => updatePerson(i, { guarantorIdFile: e.target.files?.[0] ?? null })}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label="الاسم الكامل (مقدم الطلب)">
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
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm font-semibold text-foreground">
            البريد الإلكتروني <span className="font-normal text-muted-foreground">(اختياري)</span>
          </label>
          <input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} className={fieldClass} />
        </div>

        <Field label="نوع الباقة">
          <select value={form.packageType} onChange={(e) => updateField("packageType", e.target.value)} className={fieldClass}>
            {PACKAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} — {PACKAGE_PRICES_SAR[option]} ريال / للفرد
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ السفر المتوقع">
          <input type="date" value={form.travelDate} onChange={(e) => updateField("travelDate", e.target.value)} className={fieldClass} />
        </Field>

        <Field label="طريقة الدفع">
          <select
            value={form.currency}
            onChange={(e) => updateField("currency", e.target.value as "SAR" | "SDG" | "USD")}
            className={fieldClass}
          >
            <option value="SAR">ريال سعودي</option>
            <option value="SDG" disabled={!sdgAvailable}>
              جنيه سوداني{!sdgAvailable ? " (غير متاح حاليًا)" : ""}
            </option>
            <option value="USD" disabled={!usdAvailable}>
              دولار أمريكي{!usdAvailable ? " (غير متاح حاليًا)" : ""}
            </option>
          </select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">المبلغ المستحق (تقديري، لـ {people.length} شخص)</span>
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

const CURRENCY_LABELS: Record<string, string> = { SAR: "ريال سعودي", SDG: "جنيه سوداني", USD: "دولار أمريكي" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}
