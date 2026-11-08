"use client";

import * as React from "react";
import { API_URL } from "@/lib/api-url";
import { btn, cx } from "@/components/admin/operations/ops-ui";

// One pilgrim's visa processing state (PATCH /contact-requests/:id/travelers/
// :travelerId/visa-state). It only records where the visa stands: «issued»
// is never set here (it exists when the visa file is published), and a
// delayed or rejected pilgrim keeps the request open. The reason is shown to
// the customer, and the form says so. The server owns every rule; this only
// offers the control and reports the server's own message next to the field.
export type VisaStateValue = "PENDING" | "IN_PROGRESS" | "DELAYED" | "REJECTED";
export const VISA_STATE_LABEL: Record<VisaStateValue, string> = {
  PENDING: "بانتظار المعالجة",
  IN_PROGRESS: "قيد المعالجة",
  DELAYED: "متأخرة",
  REJECTED: "مرفوضة",
};

type Field = "reason" | "followUpAt" | "form";
type Saved = { state: VisaStateValue; reason: string | null; followUpAt: string | null };

export function VisaStateControl({
  requestId,
  travelerId,
  travelerName,
  initial,
}: {
  requestId: string;
  travelerId: string;
  travelerName: string;
  initial: { state: VisaStateValue | null; reason?: string | null; followUpAt?: string | null };
}) {
  const [saved, setSaved] = React.useState<Saved>({ state: initial.state ?? "IN_PROGRESS", reason: initial.reason ?? null, followUpAt: initial.followUpAt ? String(initial.followUpAt).slice(0, 10) : null });
  const [state, setState] = React.useState<VisaStateValue>(saved.state);
  const [reason, setReason] = React.useState(saved.reason ?? "");
  const [followUpAt, setFollowUpAt] = React.useState(saved.followUpAt ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ field: Field; text: string } | null>(null);
  const [ok, setOk] = React.useState("");
  const needsReason = state === "DELAYED" || state === "REJECTED";
  const id = React.useId();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setOk("");
    if (needsReason && reason.trim().length < 5) return setError({ field: "reason", text: "اكتب السبب (٥ أحرف على الأقل)؛ يظهر للعميل." });
    if (state === "DELAYED" && !followUpAt) return setError({ field: "followUpAt", text: "حدّد تاريخ المتابعة التالي." });
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(requestId)}/travelers/${encodeURIComponent(travelerId)}/visa-state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, ...(needsReason ? { reason: reason.trim() } : {}), ...(state === "DELAYED" ? { followUpAt } : {}) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = String(payload?.code || "");
        const field: Field = code.startsWith("FOLLOW_UP") ? "followUpAt" : code === "REASON_REQUIRED" ? "reason" : "form";
        throw Object.assign(new Error(payload?.message || "تعذّر حفظ الحالة."), { field });
      }
      setSaved({ state, reason: needsReason ? reason.trim() : null, followUpAt: state === "DELAYED" ? followUpAt : null });
      setOk("حُفظت الحالة وسُجّلت في السجل.");
    } catch (e) {
      setError({ field: (e as { field?: Field }).field || "form", text: e instanceof Error ? e.message : "تعذّر حفظ الحالة." });
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm";
  const invalid = (field: Field) => (error?.field === field ? true : undefined);

  return (
    <form onSubmit={save} className="mt-2 grid gap-2 rounded-[10px] bg-muted/40 p-2 text-sm" data-testid="visa-state-form" aria-label={`حالة تأشيرة ${travelerName}`} noValidate>
      <p className="text-xs text-muted-foreground">
        الحالة الحالية: <b data-testid="visa-state-current">{VISA_STATE_LABEL[saved.state]}</b>
        {saved.followUpAt ? <> — المتابعة <bdi dir="ltr">{saved.followUpAt}</bdi></> : null}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={`${id}-state`} className="flex flex-col text-xs font-bold">حالة التأشيرة
          <select id={`${id}-state`} value={state} onChange={(e) => setState(e.target.value as VisaStateValue)} className={cx(inputClass, "min-w-40")}>
            {(Object.keys(VISA_STATE_LABEL) as VisaStateValue[]).map((value) => <option key={value} value={value}>{VISA_STATE_LABEL[value]}</option>)}
          </select>
        </label>
        {state === "DELAYED" ? (
          <label htmlFor={`${id}-date`} className="flex flex-col text-xs font-bold">المتابعة التالية
            <input id={`${id}-date`} type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} aria-invalid={invalid("followUpAt")} aria-describedby={error?.field === "followUpAt" ? `${id}-err` : undefined} className={inputClass} />
          </label>
        ) : null}
        <button type="submit" disabled={busy} className={cx(btn.base, btn.secondary, btn.sm)}>{busy ? "جارٍ الحفظ…" : "حفظ الحالة"}</button>
      </div>
      {needsReason ? (
        <label htmlFor={`${id}-reason`} className="flex flex-col text-xs font-bold">السبب (يظهر للعميل)
          <textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} aria-invalid={invalid("reason")} aria-describedby={error?.field === "reason" ? `${id}-err` : undefined} className={cx(inputClass, "h-auto py-1")} />
        </label>
      ) : null}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs font-bold text-[var(--nh-danger-ink)]">{error.text}</p> : null}
      {ok ? <p role="status" className="text-xs font-bold text-[var(--nh-success-ink)]">{ok}</p> : null}
      <p className="text-xs text-muted-foreground">لا يُغلق الطلب ولا يُسترد مبلغ تلقائيًا؛ القرار النهائي بيد الإدارة.</p>
    </form>
  );
}
