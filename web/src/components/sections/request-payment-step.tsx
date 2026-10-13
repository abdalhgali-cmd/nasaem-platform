"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the payment summary is loaded once from the API. */

import * as React from "react";
import { Check, Copy, Landmark, Loader2, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

// The payment step straight after a fixed-price submission (backend
// contact-request-payment-access): the amount and currency the customer
// accepted, the agency's accounts in that currency and the transfer receipt,
// on one screen. The request-scoped token comes from the creation response
// and is sent as X-Payment-Access; it opens nothing but this request's
// payment. A receipt puts the payment «بانتظار مراجعة التحويل» — never paid —
// until an authorised staff member confirms it.

export type PaymentAccess = { token: string; expiresAt: string };

// A request saved at a fixed price whose payment is not finished yet, kept
// for this browser tab only (sessionStorage) so a refresh during the payment
// step comes back to it instead of the form — the request is never sent a
// second time. Cleared when the customer finishes or chooses to pay later.
export type PendingPayment = { requestId: string; access: PaymentAccess };
const PENDING_KEY = "nasaem-pending-payment";

export function savePendingPayment(surface: string, pending: PendingPayment) {
  try {
    window.sessionStorage.setItem(`${PENDING_KEY}:${surface}`, JSON.stringify(pending));
  } catch {
    // Storage unavailable: the payment can still be finished from /track.
  }
}

export function readPendingPayment(surface: string): PendingPayment | null {
  try {
    const raw = window.sessionStorage.getItem(`${PENDING_KEY}:${surface}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPayment;
    if (!parsed?.requestId || !parsed.access?.token) return null;
    if (parsed.access.expiresAt && new Date(parsed.access.expiresAt).getTime() <= Date.now()) {
      clearPendingPayment(surface);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingPayment(surface: string) {
  try {
    window.sessionStorage.removeItem(`${PENDING_KEY}:${surface}`);
  } catch {
    // ignore
  }
}

export type PaymentSummary = {
  id: string;
  service: string | null;
  statusLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  amount: string | null;
  currency: string | null;
  amountSdg: string | null;
  paymentOpen: boolean;
  lockReasons: string[];
  rejectionReason: string | null;
  accounts: {
    id: string;
    name: string | null;
    bankName: string | null;
    accountName: string | null;
    accountNumber: string | null;
    iban: string | null;
    currency: string;
  }[];
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

function formatAmount(amount: string | null, currency: string | null) {
  if (amount == null) return "";
  return `${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={label}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      <span aria-live="polite">{copied ? "تم النسخ" : "نسخ"}</span>
    </button>
  );
}

export function RequestPaymentStep({
  requestId,
  access,
  onFinished,
  resumed = false,
}: {
  requestId: string;
  access: PaymentAccess;
  /** Shown again after a page refresh: the request already exists. */
  resumed?: boolean;
  /** Called with the latest summary after the receipt is sent, or with the last known one when the customer chooses to pay later. */
  onFinished: (summary: PaymentSummary | null, outcome: "RECEIPT_SENT" | "LATER") => void;
}) {
  const [summary, setSummary] = React.useState<PaymentSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState("");
  const sendingRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(requestId)}/payment-access`, {
        headers: { "X-Payment-Access": access.token },
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.message || "تعذّر تحميل بيانات الدفع");
      setSummary(payload.data as PaymentSummary);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذّر تحميل بيانات الدفع");
    } finally {
      setLoading(false);
    }
  }, [requestId, access.token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function pickFile(next: File | null) {
    setSendError("");
    if (!next) {
      setFile(null);
      setFileError("");
      return;
    }
    if (!ALLOWED_TYPES.includes(next.type)) {
      setFile(null);
      setFileError("ارفع صورة (JPG/PNG/WEBP) أو ملف PDF.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      setFileError("حجم الملف أكبر من 10 ميغابايت.");
      return;
    }
    setFileError("");
    setFile(next);
  }

  async function sendReceipt() {
    // One upload at a time: repeated taps never send a second receipt.
    if (!file || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(requestId)}/payment-access/receipt`, {
        method: "POST",
        headers: { "X-Payment-Access": access.token },
        body: form,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.message || "تعذّر رفع إشعار التحويل، حاول مرة أخرى");
      onFinished((payload.data?.request as PaymentSummary) ?? summary, "RECEIPT_SENT");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "تعذّر رفع إشعار التحويل، حاول مرة أخرى");
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg justify-center rounded-3xl border border-border bg-card p-10">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !summary) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm" role="alert">
        <p className="font-semibold text-red-600 dark:text-red-400">{loadError || "تعذّر تحميل بيانات الدفع"}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" onClick={() => void load()}>إعادة المحاولة</Button>
          <Button type="button" variant="ghost" onClick={() => onFinished(null, "LATER")}>متابعة بدون الدفع الآن</Button>
        </div>
      </div>
    );
  }

  const amountText = formatAmount(summary.amount, summary.currency);
  const sdgText = summary.currency !== "SDG" && summary.amountSdg ? formatAmount(summary.amountSdg, "SDG") : "";

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8" data-testid="payment-step">
      {resumed ? (
        <p className="mb-3 rounded-xl bg-primary/5 p-3 text-xs font-semibold text-primary dark:text-secondary" data-testid="payment-resumed">
          طلبك محفوظ مسبقًا ولن يُرسل مرة أخرى؛ أكمل الدفع من هنا.
        </p>
      ) : null}
      <p className="text-xs font-bold text-primary dark:text-secondary">الخطوة الأخيرة</p>
      <h3 className="mt-1 text-xl font-bold text-foreground">الدفع بالتحويل البنكي</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        حُفظ طلبك برقم <span dir="ltr" className="font-mono font-semibold text-foreground">{summary.id}</span>. حوّل المبلغ ثم ارفع إشعار التحويل لإرساله للمراجعة.
      </p>

      <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">المبلغ المطلوب</span>
          <span className="text-lg font-bold text-foreground" dir="ltr" data-testid="payment-amount">{amountText}</span>
        </div>
        {sdgText ? (
          <p className="mt-1 text-xs text-muted-foreground">
            ما يعادل <span dir="ltr">{sdgText}</span> بسعر الصرف المعتمد وقت تأكيد الطلب
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">حوّل المبلغ بالعملة نفسها ({summary.currency}) إلى أحد الحسابات التالية فقط.</p>
      </div>

      {summary.rejectionReason ? (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">
          لم يُقبل الإشعار السابق: {summary.rejectionReason}
        </p>
      ) : null}

      {summary.paymentOpen ? (
        <>
          <div className="mt-5 flex flex-col gap-3">
            {summary.accounts.length === 0 ? (
              <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                لا يوجد حساب دفع مفعّل لهذه العملة حاليًا. لا تحوّل أي مبلغ قبل تواصل الوكالة معك.
              </p>
            ) : (
              summary.accounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-border p-4 text-sm" data-testid="payment-account">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <Landmark className="size-4 text-primary" />
                    {account.bankName || account.name || "حساب الدفع"}
                  </div>
                  {account.accountName ? <p className="mt-1 text-muted-foreground">صاحب الحساب: {account.accountName}</p> : null}
                  {account.accountNumber ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-1.5">
                      <span dir="ltr" className="font-mono font-semibold text-foreground">{account.accountNumber}</span>
                      <CopyButton value={account.accountNumber} label="نسخ رقم الحساب" />
                    </div>
                  ) : null}
                  {account.iban ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-1.5">
                      <span dir="ltr" className="font-mono text-xs font-semibold text-foreground">{account.iban}</span>
                      <CopyButton value={account.iban} label="نسخ IBAN" />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="mt-5">
            <label htmlFor="payment-receipt" className="text-sm font-semibold text-foreground">
              إشعار التحويل (صورة أو PDF) <span className="text-red-500">*</span>
            </label>
            <label
              htmlFor="payment-receipt"
              className="mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm text-muted-foreground transition hover:border-primary/50"
            >
              <Upload className="size-4" />
              {file ? file.name : "اختر ملف الإشعار"}
            </label>
            <input
              id="payment-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              data-testid="payment-receipt-input"
            />
            {fileError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{fileError}</p> : null}
          </div>

          {sendError ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {sendError}
            </p>
          ) : null}

          <Button type="button" variant="gold" size="lg" className="mt-5 w-full" disabled={!file || sending} onClick={() => void sendReceipt()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "جارٍ الإرسال..." : "إرسال الطلب للمراجعة"}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            رفع الإشعار لا يعني تأكيد السداد؛ تصبح حالة الدفع «بانتظار مراجعة التحويل» حتى يؤكدها موظف مختص.
          </p>
        </>
      ) : (
        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{summary.paymentStatusLabel}</p>
          {summary.lockReasons.map((reason) => (
            <p key={reason} className="mt-1">{reason}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onFinished(summary, "LATER")}
        disabled={sending}
        className="mt-4 w-full text-center text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {summary.paymentOpen ? "سأحوّل لاحقًا — متابعة إلى صفحة التأكيد" : "متابعة إلى صفحة التأكيد"}
      </button>
    </div>
  );
}
