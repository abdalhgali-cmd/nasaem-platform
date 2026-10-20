"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the payment summary is loaded once from the API. */

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { customerErrorMessage } from "@/lib/network-error";
import {
  BankTransferPayment,
  normalizeSettlementOptions,
  type LegacyPaymentAccount,
  type SettlementOption,
} from "@/components/sections/payment-transfer";

// The payment step straight after a fixed-price submission (backend
// contact-request-payment-access): the amount and currency the customer
// accepted, the agency's accounts in that currency and the transfer receipt,
// on one screen (the shared BankTransferPayment in payment-transfer.tsx, also
// used by /track). The request-scoped token comes from the creation response
// and is sent as X-Payment-Access; it opens nothing but this request's
// payment. A receipt puts the payment «بانتظار مراجعة الدفع» — never paid —
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
  exchangeRateToSdg?: string | null;
  invoiceVersion?: number | null;
  paymentOpen: boolean;
  lockReasons: string[];
  rejectionReason: string | null;
  accounts: LegacyPaymentAccount[];
  settlementOptions?: SettlementOption[];
};

function paymentPath(requestId: string) {
  return `${API_URL}/contact-requests/${encodeURIComponent(requestId)}/payment-access`;
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
  const [busy, setBusy] = React.useState(false);

  const fetchSummary = React.useCallback(async () => {
    const res = await fetch(paymentPath(requestId), {
      headers: { "X-Payment-Access": access.token },
      cache: "no-store",
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success) throw new Error(payload?.message || "تعذّر تحميل بيانات الدفع");
    return payload.data as PaymentSummary;
  }, [requestId, access.token]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setSummary(await fetchSummary());
    } catch (error) {
      setLoadError(customerErrorMessage(error, "تعذّر تحميل بيانات الدفع"));
    } finally {
      setLoading(false);
    }
  }, [fetchSummary]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The accounts or the invoice changed under the customer: reload them in
  // place (the chosen receipt stays picked).
  async function refreshOptions() {
    try {
      setSummary(await fetchSummary());
    } catch {
      // Keep what is shown; the next attempt is checked by the server again.
    }
  }

  // Re-reads the payment summary; true (and finishes the step) when the
  // server already holds a receipt for this request.
  async function receiptAlreadySubmitted() {
    try {
      const current = await fetchSummary();
      if (current.paymentStatus !== "UNDER_REVIEW" && current.paymentStatus !== "CONFIRMED") return false;
      onFinished(current, "RECEIPT_SENT");
      return true;
    } catch {
      return false;
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg justify-center rounded-3xl border border-border bg-card p-10" role="status" aria-label="جارٍ تحميل بيانات الدفع">
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

  const options = normalizeSettlementOptions(summary);
  const underReview = summary.paymentStatus === "UNDER_REVIEW";
  const open = summary.paymentOpen && !underReview;

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-4 shadow-sm min-[400px]:p-6 sm:p-8" data-testid="payment-step">
      {resumed ? (
        <p className="mb-3 rounded-xl bg-primary/5 p-3 text-xs font-semibold text-primary dark:text-secondary" data-testid="payment-resumed">
          طلبك محفوظ مسبقًا ولن يُرسل مرة أخرى؛ أكمل الدفع من هنا.
        </p>
      ) : null}
      <p className="text-xs font-bold text-primary dark:text-secondary">الخطوة الأخيرة</p>
      <h3 className="mt-1 text-xl font-bold text-foreground">الدفع بالتحويل البنكي</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        حُفظ طلبك برقم <span dir="ltr" className="font-mono font-semibold text-foreground">{summary.id}</span>. حوّل المبلغ إلى أحد الحسابات المعتمدة ثم ارفع إشعار التحويل لإرساله للمراجعة.
      </p>

      {summary.rejectionReason ? (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">
          لم يُقبل الإشعار السابق: {summary.rejectionReason}
        </p>
      ) : null}

      {underReview ? (
        <p className="mt-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm" role="status" data-testid="payment-under-review">
          <b className="text-foreground">بانتظار مراجعة الدفع</b> — وصل إشعار التحويل، ويؤكد موظف الوكالة استلام المبلغ بعد مطابقته مع البنك.
        </p>
      ) : null}

      {open ? (
        <BankTransferPayment
          idPrefix={`direct-${summary.id}`}
          amount={summary.amount}
          currency={summary.currency}
          amountSdg={summary.amountSdg}
          options={options}
          invoiceVersion={summary.invoiceVersion}
          canUpload
          submitLabel="إرسال الطلب للمراجعة"
          receiptUrl={`${paymentPath(requestId)}/receipt`}
          requestHeaders={{ "X-Payment-Access": access.token }}
          onSent={(data) => onFinished(((data as { request?: PaymentSummary } | null)?.request as PaymentSummary) ?? summary, "RECEIPT_SENT")}
          checkAlreadySubmitted={receiptAlreadySubmitted}
          refreshOptions={refreshOptions}
          onBusyChange={setBusy}
        />
      ) : !underReview ? (
        <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{summary.paymentStatusLabel}</p>
          {summary.lockReasons.map((reason) => (
            <p key={reason} className="mt-1">{reason}</p>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onFinished(summary, underReview ? "RECEIPT_SENT" : "LATER")}
        disabled={busy}
        className="mt-4 min-h-11 w-full text-center text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline disabled:opacity-50"
      >
        {open ? (options.length ? "سأحوّل لاحقًا — متابعة إلى صفحة التأكيد" : "متابعة بدون دفع الآن") : "متابعة إلى صفحة التأكيد"}
      </button>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        يمكنك متابعة مراحل الطلب من{" "}
        <Link href="/track" className="font-semibold text-primary underline-offset-4 hover:underline">تتبع الطلب</Link>{" "}
        بعد التحقق من رقم هاتفك، حتى لو لم تدفع بعد.
      </p>
    </div>
  );
}
