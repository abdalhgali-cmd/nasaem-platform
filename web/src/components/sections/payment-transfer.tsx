"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, Check, Copy, FileText, ImageIcon, Landmark, Loader2, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// The bank-transfer step shared by the payment straight after a fixed-price
// submission (request-payment-step.tsx, X-Payment-Access) and the payment
// step on /track (tracking-panel.tsx, tracking session): the invoice amount
// and its frozen SDG equivalent, the agency accounts that may take it
// (backend payment-settlement.service.js settlementOptions) and the transfer
// receipt — camera, gallery image or PDF — with a preview, upload progress
// and retry. The chosen account and the invoice version shown are sent with
// the receipt; the server checks both again. A receipt only puts the payment
// «بانتظار مراجعة الدفع» — never paid — until staff confirm it. Mirrors the
// app's payment-receipt.js.

export type SettlementOption = {
  accountId: string;
  kind: "INVOICE_CURRENCY" | "SDG_EQUIVALENT";
  payCurrency: string;
  payAmount: string | null;
  rate?: string | null;
  rateFixedAt?: string | null;
  name?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  currency?: string | null;
};

export type LegacyPaymentAccount = {
  id: string;
  name?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  currency?: string | null;
};

// The ways to pay, from the server's `settlementOptions`. An older server
// sends only `accounts` in the invoice currency.
export function normalizeSettlementOptions({
  settlementOptions,
  accounts,
  amount,
  currency,
}: {
  settlementOptions?: SettlementOption[] | null;
  accounts?: LegacyPaymentAccount[] | null;
  amount: string | null;
  currency: string | null;
}): SettlementOption[] {
  if (Array.isArray(settlementOptions)) return settlementOptions.filter((option) => option && option.accountId);
  return (accounts ?? []).map((account) => ({
    ...account,
    accountId: account.id,
    kind: "INVOICE_CURRENCY" as const,
    payCurrency: account.currency || currency || "",
    payAmount: amount,
  }));
}

export const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const RECEIPT_PDF_TYPE = "application/pdf";
// Same limit as the server's receipt upload (backend upload.middleware.js).
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export function formatAmount(amount: string | number | null | undefined, currency: string | null | undefined) {
  if (amount == null || amount === "") return "";
  return `${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency ?? ""}`.trim();
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function receiptProblem(file: File): string | null {
  if (![...RECEIPT_IMAGE_TYPES, RECEIPT_PDF_TYPE].includes(file.type)) return "ارفع صورة (JPG/PNG/WEBP) أو ملف PDF.";
  if (file.size > RECEIPT_MAX_BYTES) return "حجم الملف أكبر من 10 ميغابايت.";
  if (file.size === 0) return "الملف فارغ؛ اختر ملفًا آخر.";
  return null;
}

export function CopyButton({ value, label }: { value: string; label: string }) {
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
          // Clipboard is a convenience; the value stays visible to copy by hand.
          setCopied(false);
        }
      }}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={label}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      <span aria-live="polite">{copied ? "تم النسخ" : "نسخ"}</span>
    </button>
  );
}

type UploadResult = { status: number; payload: { success?: boolean; code?: string; message?: string; data?: unknown } | null };

class UploadNetworkError extends Error {}

// XMLHttpRequest rather than fetch: fetch reports no upload progress.
function postReceipt({
  url,
  form,
  headers,
  withCredentials,
  onProgress,
}: {
  url: string;
  form: FormData;
  headers?: Record<string, string>;
  withCredentials?: boolean;
  onProgress: (percent: number) => void;
}): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = Boolean(withCredentials);
    for (const [name, value] of Object.entries(headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, (event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let payload: UploadResult["payload"] = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      resolve({ status: xhr.status, payload });
    };
    const fail = () => reject(new UploadNetworkError("network"));
    // A stalled connection ends as a network failure (then the server's
    // state is checked before a retry is offered), never an endless upload.
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = fail;
    xhr.send(form);
  });
}

const UPLOAD_TIMEOUT_MS = 120_000;

// A reconciliation call that fails (offline again) answers "not settled":
// the busy state is always released and a retry offered.
async function settledSafely(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

const OFFLINE_MESSAGE = "تعذّر الاتصال. تحقق من الإنترنت ثم اضغط «إعادة المحاولة»؛ الإشعار المختار ما زال جاهزًا.";

type Chosen = { file: File; previewUrl: string | null };

export function BankTransferPayment({
  idPrefix,
  amount,
  currency,
  amountSdg,
  options,
  invoiceVersion,
  canUpload,
  submitLabel,
  receiptUrl,
  requestHeaders,
  withCredentials,
  onSent,
  checkAlreadySubmitted,
  refreshOptions,
  onBusyChange,
}: {
  /** Unique per request on the page (input ids). */
  idPrefix: string;
  amount: string | null;
  currency: string | null;
  /** The SDG equivalent frozen on the invoice when it was issued. */
  amountSdg: string | null;
  options: SettlementOption[];
  invoiceVersion: number | null | undefined;
  canUpload: boolean;
  submitLabel: string;
  receiptUrl: string;
  requestHeaders?: Record<string, string>;
  withCredentials?: boolean;
  /** The server stored the receipt (2xx). */
  onSent: (data: unknown) => void | Promise<void>;
  /** Re-reads the payment; true (and finishes the step) when the server already holds a receipt. */
  checkAlreadySubmitted: () => Promise<boolean>;
  /** The accounts or the invoice changed: reload them without leaving the step. */
  refreshOptions: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [picked, setPicked] = React.useState("");
  const [chosen, setChosen] = React.useState<Chosen | null>(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [failedOnce, setFailedOnce] = React.useState(false);
  const sendingRef = React.useRef(false);
  const previewRef = React.useRef<string | null>(null);

  // The only option is selected for the customer; otherwise they pick one.
  const selectedId = options.length === 1 ? options[0].accountId : options.some((o) => o.accountId === picked) ? picked : "";

  React.useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function setBusy(busy: boolean) {
    sendingRef.current = busy;
    setSending(busy);
    onBusyChange?.(busy);
  }

  function choose(next: File | null) {
    if (!next) return;
    const problem = receiptProblem(next);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const previewUrl = RECEIPT_IMAGE_TYPES.includes(next.type) && typeof URL.createObjectURL === "function" ? URL.createObjectURL(next) : null;
    previewRef.current = previewUrl;
    setChosen({ file: next, previewUrl });
  }

  function remove() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setChosen(null);
    setError("");
  }

  async function send() {
    // One upload at a time: repeated taps never send a second receipt.
    if (sendingRef.current) return;
    if (!selectedId) {
      setError("اختر الحساب الذي حوّلت إليه.");
      return;
    }
    if (!chosen) {
      setError("صوّر إشعار التحويل أو اختر صورته أو ملف PDF.");
      return;
    }
    setError("");
    setNotice("");
    setProgress(0);
    setBusy(true);
    const form = new FormData();
    form.set("settlementAccountId", selectedId);
    if (invoiceVersion !== undefined && invoiceVersion !== null) form.set("invoiceVersion", String(invoiceVersion));
    form.append("file", chosen.file);
    try {
      const { status, payload } = await postReceipt({ url: receiptUrl, form, headers: requestHeaders, withCredentials, onProgress: setProgress });
      if (status >= 200 && status < 300 && payload?.success !== false) {
        await onSent(payload?.data ?? null);
        return;
      }
      const code = payload?.code;
      if (status === 409 && (code === "INVOICE_CHANGED" || code === "SETTLEMENT_ACCOUNT_INVALID")) {
        // Show the current accounts and amount, keep the receipt already
        // picked, and say why.
        setPicked("");
        await refreshOptions().catch(() => undefined);
        setNotice(payload?.message || "تغيّرت بيانات الدفع؛ راجع الحساب والمبلغ ثم أرسل الإشعار مرة أخرى.");
        setBusy(false);
        return;
      }
      // Already submitted (an earlier attempt whose reply was lost): what
      // the server holds now decides, never a second receipt.
      if (status === 409 && (await settledSafely(checkAlreadySubmitted))) return;
      setError(payload?.message || "تعذّر رفع إشعار التحويل، حاول مرة أخرى");
      setFailedOnce(true);
      setBusy(false);
    } catch (failure) {
      if (failure instanceof UploadNetworkError && (await settledSafely(checkAlreadySubmitted))) return;
      setError(failure instanceof UploadNetworkError ? OFFLINE_MESSAGE : "تعذّر رفع إشعار التحويل، حاول مرة أخرى");
      setFailedOnce(true);
      setBusy(false);
    }
  }

  const amountText = formatAmount(amount, currency);
  const sdgText = currency && currency !== "SDG" && Number(amountSdg) > 0 ? formatAmount(amountSdg, "SDG") : "";
  const hasSdgOption = options.some((option) => option.kind === "SDG_EQUIVALENT");

  return (
    <div>
      <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">قيمة الفاتورة</span>
          <span className="text-lg font-bold text-foreground" dir="ltr" data-testid="payment-amount">{amountText}</span>
        </div>
        {sdgText ? (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="payment-amount-sdg">
            ما يعادل <bdi dir="ltr">{sdgText}</bdi> بسعر الصرف المثبّت على الفاتورة وقت تأكيد الطلب
          </p>
        ) : currency && currency !== "SDG" && !hasSdgOption ? (
          <p className="mt-1 text-xs text-muted-foreground">المقابل بالجنيه السوداني غير متاح لهذه الفاتورة؛ حوّل بالعملة الظاهرة.</p>
        ) : null}
      </div>

      {options.length === 0 ? (
        <p className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground" role="status" data-testid="no-payment-account">
          لا يوجد حاليًا حساب دفع مفعّل يقبل السداد{" "}
          {currency && currency !== "SDG" ? `بعملة الفاتورة (${currency}) أو بمقابلها بالجنيه` : "لهذه العملة"}. لا تحوّل أي مبلغ قبل أن تتواصل معك الوكالة؛ طلبك محفوظ ويمكنك متابعته من{" "}
          <Link href="/track" className="font-semibold text-primary underline-offset-4 hover:underline">
            صفحة تتبع الطلب
          </Link>
          .
        </p>
      ) : (
        <fieldset className="mt-4" disabled={sending}>
          <legend className="text-sm font-semibold text-foreground">
            {options.length > 1 ? "اختر الحساب الذي ستحوّل إليه، وحوّل المبلغ الظاهر عليه بالضبط." : "حوّل المبلغ الظاهر بالضبط إلى هذا الحساب."}
          </legend>
          <div role="radiogroup" aria-label="الحساب الذي حوّلت إليه" className="mt-2 flex flex-col gap-3" data-testid="settlement-options">
            {options.map((option) => {
              const sdg = option.kind === "SDG_EQUIVALENT";
              const checked = selectedId === option.accountId;
              const inputId = `${idPrefix}-account-${option.accountId}-${option.kind}`;
              return (
                <div
                  key={`${option.accountId}-${option.kind}`}
                  className={`rounded-2xl border p-4 text-sm transition ${checked ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background"}`}
                  data-testid="payment-account"
                  data-settlement-kind={option.kind}
                >
                  <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
                    <input
                      id={inputId}
                      type="radio"
                      name={`${idPrefix}-settlementAccountId`}
                      value={option.accountId}
                      checked={checked}
                      onChange={() => {
                        setPicked(option.accountId);
                        setError("");
                      }}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-bold text-foreground">
                        <Landmark className="size-4 text-primary" />
                        {option.bankName || option.name || "حساب الدفع"}
                        <small className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground" dir="ltr">
                          {option.currency || option.payCurrency}
                        </small>
                      </span>
                      <span className="mt-1 block text-foreground">
                        حوّل <bdi dir="ltr" className="font-black" data-testid="settlement-pay-amount">{formatAmount(option.payAmount, option.payCurrency)}</bdi>
                      </span>
                    </span>
                  </label>
                  {sdg ? (
                    <p className="mt-2 rounded-xl bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300" data-testid="settlement-sdg-note">
                      سداد بالجنيه السوداني بالمبلغ المثبّت على فاتورتك عند إصدارها (سعر الصرف{" "}
                      <bdi dir="ltr">{option.rate ? Number(option.rate).toLocaleString("en-US") : "—"}</bdi>). فاتورتك الأصلية{" "}
                      <bdi dir="ltr">{amountText}</bdi> لا تتغيّر.
                    </p>
                  ) : null}
                  {option.accountName ? <p className="mt-2 text-muted-foreground">صاحب الحساب: <span className="font-semibold text-foreground">{option.accountName}</span></p> : null}
                  {option.accountNumber ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-1.5">
                      <span className="min-w-0">
                        <span className="block text-[11px] text-muted-foreground">رقم الحساب</span>
                        <span dir="ltr" className="block break-all font-mono font-semibold text-foreground">{option.accountNumber}</span>
                      </span>
                      <CopyButton value={option.accountNumber} label="نسخ رقم الحساب" />
                    </div>
                  ) : null}
                  {option.iban ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-1.5">
                      <span className="min-w-0">
                        <span className="block text-[11px] text-muted-foreground">IBAN</span>
                        <span dir="ltr" className="block break-all font-mono text-xs font-semibold text-foreground">{option.iban}</span>
                      </span>
                      <CopyButton value={option.iban} label="نسخ IBAN" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {notice ? (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-300" role="alert" data-testid="payment-notice">
          {notice}
        </p>
      ) : null}

      {canUpload && options.length > 0 ? (
        <div className="mt-5" data-testid="receipt-picker">
          <p className="text-sm font-semibold text-foreground">
            إشعار التحويل (صورة أو PDF) <span className="text-red-500">*</span>
          </p>
          {chosen ? (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background p-3" data-testid="receipt-preview">
              {chosen.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable remote image.
                <img src={chosen.previewUrl} alt="معاينة إشعار التحويل" className="size-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FileText className="size-7 text-primary" />
                </span>
              )}
              <span className="min-w-0 flex-1 text-xs">
                <span className="block truncate font-semibold text-foreground" dir="ltr" data-testid="receipt-name">{chosen.file.name || "إشعار التحويل"}</span>
                <span className="text-muted-foreground" dir="ltr">{formatBytes(chosen.file.size)}</span>
              </span>
              <button
                type="button"
                onClick={remove}
                disabled={sending}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-600 outline-none hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:text-red-400"
              >
                <X className="size-4" />
                إزالة
              </button>
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            {(
              [
                { source: "camera", icon: Camera, label: chosen ? "إعادة التصوير" : "تصوير الإشعار", aria: "تصوير إشعار التحويل بالكاميرا", accept: "image/*", testId: "payment-receipt-camera" },
                { source: "gallery", icon: ImageIcon, label: chosen ? "استبدال بصورة" : "صورة من المعرض", aria: "اختيار صورة الإشعار من المعرض", accept: RECEIPT_IMAGE_TYPES.join(","), testId: "payment-receipt-input" },
                { source: "pdf", icon: FileText, label: chosen ? "استبدال بملف PDF" : "ملف PDF", aria: "اختيار إشعار التحويل بصيغة PDF", accept: "application/pdf,.pdf", testId: "payment-receipt-pdf" },
              ] as const
            ).map(({ source, icon: Icon, label, aria, accept, testId }) => (
              <label
                key={source}
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-semibold text-foreground transition focus-within:ring-2 focus-within:ring-primary hover:border-primary/50 ${sending ? "pointer-events-none opacity-50" : ""}`}
              >
                <Icon className="size-4 text-primary" />
                <span>{label}</span>
                <input
                  type="file"
                  className="sr-only"
                  accept={accept}
                  {...(source === "camera" ? { capture: "environment" as const } : {})}
                  aria-label={aria}
                  disabled={sending}
                  data-testid={testId}
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    // Picking the same file again after removing it still fires.
                    event.target.value = "";
                    choose(next);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">صورة JPG/PNG/WEBP أو PDF، حتى 10 ميغابايت.</p>

          {sending ? (
            <div className="mt-3" data-testid="receipt-progress">
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="تقدّم رفع الإشعار"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <small className="mt-1 block text-xs text-muted-foreground">جارٍ الرفع… {Math.round(progress)}%</small>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert" data-testid="payment-error">
              {error}
            </p>
          ) : null}

          <Button type="button" variant="gold" size="lg" className="mt-4 w-full" disabled={!chosen || sending} onClick={() => void send()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : failedOnce ? <RotateCcw className="size-4" /> : <Send className="size-4" />}
            {sending ? "جارٍ الإرسال..." : failedOnce ? "إعادة المحاولة" : submitLabel}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            رفع الإشعار لا يعني أن الدفع تم؛ تكون حالة الدفع «بانتظار مراجعة الدفع» حتى يؤكد موظف الوكالة استلام المبلغ بعد مطابقته مع البنك.
          </p>
        </div>
      ) : null}
    </div>
  );
}
