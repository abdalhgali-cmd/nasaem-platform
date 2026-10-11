"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the panel loads the case detail from the API when it opens (same pattern as case-workspace.tsx). */

import * as React from "react";
import { CheckCircle2, CircleDot, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

// The request workflow inside the case workspace: price, payment receipt,
// execution, final files and closing. Every control is shown only when the
// server lists the action in `allowedActions` for this staff member (the
// same policy it enforces), and every refusal shows the server's Arabic
// reason. No second workflow: these are the same endpoints the back-office
// request screen uses.

type Step = { key: string; label: string; state: "done" | "current" | "upcoming" };
type Reason = { code: string; message: string };
type Deliverable = { id: string; label: string; publishedAt: string | null; travelerIds: string[]; createdAt: string };
type Detail = {
  id: string;
  status: string;
  outcome: string | null;
  paymentStatus: string;
  paymentRejectionReason: string | null;
  executionStartedAt: string | null;
  executionNote: string | null;
  invoice: { amount: string; currency: string; status: string; amountSdg: string | null } | null;
  offers: { id: string; carrier: string; amount: string; currency: string }[];
  selectedOfferId: string | null;
  travelers: { id: string; fullName: string }[];
  documents: { id: string; label: string; status: string; classification: string; supersededAt: string | null }[];
  deliverables: Deliverable[];
  allowedActions: string[];
  progress: {
    label: string;
    serviceKindLabel: string;
    steps: Step[];
    blockers: Reason[];
    delivery: { complete: boolean; missingTravelerIds: string[] };
  };
};

const PAYMENT_LABEL: Record<string, string> = {
  NOT_REQUIRED: "لم يُحدَّد سعر",
  AWAITING_TRANSFER: "بانتظار التحويل",
  UNDER_REVIEW: "إيصال قيد المراجعة",
  CONFIRMED: "الدفع مقبول",
};
const CURRENCIES = ["SAR", "USD", "SDG", "EGP", "AED"];

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const reasons: Reason[] = payload?.reasons ?? [];
    throw new Error(payload?.message || reasons.map((r) => r.message).join(" ") || "تعذر تنفيذ العملية");
  }
  return payload;
}

function postJson(path: string, body: unknown) {
  return call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function CaseWorkflowPanel({ caseId, onChanged }: { caseId: string; onChanged: () => void }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const payload = await call(`/contact-requests/${encodeURIComponent(caseId)}`);
      setDetail(payload.data as Detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الطلب");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      setMessage(success);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    } finally {
      await load();
      setBusy(false);
    }
  }

  if (loading && !detail) return <p className="text-sm text-muted-foreground">جارٍ تحميل سير العمل...</p>;
  if (!detail) return <p className="text-sm font-bold text-destructive">{error || "تعذر تحميل الطلب"}</p>;

  const can = (action: string) => detail.allowedActions.includes(action);
  const base = `/contact-requests/${encodeURIComponent(detail.id)}`;
  const nameOf = (id: string) => detail.travelers.find((t) => t.id === id)?.fullName ?? "—";
  const receipts = detail.documents.filter((d) => d.classification === "FINANCIAL_DOCUMENT" && !d.supersededAt);

  return (
    <div className="flex flex-col gap-4" data-testid="case-workflow">
      {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700" role="status">{message}</p> : null}
      {error ? <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-bold text-destructive" role="alert">{error}</p> : null}

      <section className="rounded-2xl border border-border p-4">
        <p className="text-xs text-muted-foreground">{detail.progress.serviceKindLabel} · ما يراه العميل:</p>
        <p className="mt-1 font-black" data-testid="workflow-label">{detail.progress.label}</p>
        <ol className="mt-3 flex flex-col gap-1">
          {detail.progress.steps.map((step) => (
            <li key={step.key} data-step={step.key} data-state={step.state} className={`flex items-center gap-2 text-sm ${step.state === "current" ? "font-black" : step.state === "done" ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
              {step.state === "done" ? <CheckCircle2 className="size-4 text-emerald-600" /> : step.state === "current" ? <CircleDot className="size-4 text-primary" /> : <Circle className="size-4" />}
              {step.label}
            </li>
          ))}
        </ol>
        {detail.status === "CLOSED" ? <p className="mt-3 text-xs font-bold text-muted-foreground">الطلب مغلق وللقراءة فقط.</p> : null}
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h4 className="font-black">السعر</h4>
        {detail.invoice ? (
          <p className="mt-1 text-sm">{Number(detail.invoice.amount).toLocaleString("en-US")} {detail.invoice.currency} — {detail.invoice.status === "APPROVED" ? "وافق العميل" : detail.invoice.status === "REJECTED" ? "رفضه العميل" : "بانتظار العميل"}</p>
        ) : detail.offers.length ? (
          <ul className="mt-1 text-sm">{detail.offers.map((o) => <li key={o.id}>{o.carrier}: {Number(o.amount).toLocaleString("en-US")} {o.currency}{o.id === detail.selectedOfferId ? " — اختاره العميل" : ""}</li>)}</ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">لم يُحدَّد سعر بعد.</p>
        )}
        {can("ISSUE_QUOTE") ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            data-testid="workflow-quote"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const amount = Number(form.get("amount"));
              if (!(amount > 0)) return setError("أدخل مبلغًا أكبر من صفر.");
              void run(() => postJson(`${base}/invoice`, { amount, currency: form.get("currency"), description: form.get("description") || undefined }), "تم حفظ السعر وإرساله للعميل.");
            }}
          >
            <label className="flex flex-col text-xs font-bold">المبلغ<input name="amount" type="number" min="0.01" step="0.01" required className="mt-1 h-9 w-32 rounded-lg border bg-background px-2 text-sm" /></label>
            <label className="flex flex-col text-xs font-bold">العملة<select name="currency" defaultValue={detail.invoice?.currency ?? "SAR"} className="mt-1 h-9 rounded-lg border bg-background px-2 text-sm">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="flex flex-col text-xs font-bold">وصف (اختياري)<input name="description" maxLength={200} className="mt-1 h-9 rounded-lg border bg-background px-2 text-sm" /></label>
            <Button type="submit" size="sm" disabled={busy}>{detail.invoice ? "تحديث السعر" : "حفظ السعر"}</Button>
          </form>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h4 className="font-black">الدفع: {PAYMENT_LABEL[detail.paymentStatus] ?? detail.paymentStatus}</h4>
        {receipts.length ? (
          <ul className="mt-1 text-sm">
            {receipts.map((receipt) => (
              <li key={receipt.id}><a className="text-primary underline" href={`${API_URL}${base}/documents/${encodeURIComponent(receipt.id)}/file`} target="_blank" rel="noreferrer">{receipt.label}</a> — {receipt.status === "PENDING" ? "قيد المراجعة" : receipt.status === "ACCEPTED" ? "مقبول" : "مرفوض"}</li>
            ))}
          </ul>
        ) : null}
        {detail.paymentRejectionReason && detail.paymentStatus === "AWAITING_TRANSFER" ? <p className="mt-1 text-xs text-destructive">آخر رفض: {detail.paymentRejectionReason}</p> : null}
        {can("CONFIRM_PAYMENT") ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Button type="button" size="sm" disabled={busy} data-testid="workflow-confirm-payment" onClick={() => void run(() => postJson(`${base}/confirm-payment`, {}), "تم قبول الدفع.")}>قبول الدفع</Button>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
                if (reason.length < 3) return setError("اكتب سبب رفض الإيصال.");
                void run(() => postJson(`${base}/reject-payment`, { reason }), "تم رفض الإيصال وإبلاغ العميل بالسبب.");
              }}
            >
              <label className="flex flex-col text-xs font-bold">سبب الرفض (يظهر للعميل)<input name="reason" data-testid="workflow-reject-reason" className="mt-1 h-9 w-64 rounded-lg border bg-background px-2 text-sm" /></label>
              <Button type="submit" size="sm" variant="outline" disabled={busy}>رفض الإيصال</Button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h4 className="font-black">التنفيذ</h4>
        {detail.executionStartedAt ? <p className="mt-1 text-sm">بدأ التنفيذ {new Date(detail.executionStartedAt).toLocaleString("ar")}{detail.executionNote ? ` — ${detail.executionNote}` : ""}</p> : null}
        {can("START_EXECUTION") ? (
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const note = String(new FormData(event.currentTarget).get("note") || "").trim();
              void run(() => postJson(`${base}/start-execution`, { note: note || undefined }), "تم تسجيل بدء التنفيذ وإبلاغ العميل.");
            }}
          >
            <label className="flex flex-col text-xs font-bold">ملاحظة داخلية (اختيارية)<input name="note" maxLength={500} className="mt-1 h-9 w-64 rounded-lg border bg-background px-2 text-sm" /></label>
            <Button type="submit" size="sm" disabled={busy} data-testid="workflow-start-execution">تسجيل بدء التنفيذ</Button>
          </form>
        ) : !detail.executionStartedAt && detail.status !== "CLOSED" && detail.progress.blockers.length ? (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3" data-testid="workflow-blockers">
            <p className="text-sm font-black text-amber-800">لا يمكن بدء التنفيذ بعد:</p>
            <ul className="mt-1 list-disc ps-5 text-xs text-amber-900">{detail.progress.blockers.map((b) => <li key={b.code + b.message}>{b.message}</li>)}</ul>
          </div>
        ) : null}
        {can("REVERT_EXECUTION") ? (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
              if (reason.length < 5) return setError("اكتب سبب التصحيح (5 أحرف على الأقل).");
              void run(() => postJson(`${base}/execution/revert`, { reason }), "تم تصحيح بدء التنفيذ وتسجيل السبب.");
            }}
          >
            <label className="flex flex-col text-xs font-bold">تصحيح: سُجّل بدء التنفيذ بالخطأ — السبب<input name="reason" className="mt-1 h-9 w-64 rounded-lg border bg-background px-2 text-sm" /></label>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>تصحيح</Button>
          </form>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h4 className="font-black">الملفات النهائية</h4>
        {detail.deliverables.length ? (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {detail.deliverables.map((d) => (
              <li key={d.id} data-deliverable={d.id} className="flex flex-wrap items-center gap-2">
                <a className="text-primary underline" href={`${API_URL}${base}/deliverables/${encodeURIComponent(d.id)}/file`} target="_blank" rel="noreferrer">{d.label}</a>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${d.publishedAt ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{d.publishedAt ? "منشور للعميل" : "مسودة"}</span>
                <span className="text-xs text-muted-foreground">يخص: {d.travelerIds.length ? d.travelerIds.map(nameOf).join("، ") : detail.travelers.length > 1 ? "غير مُسند" : "الطلب كاملًا"}</span>
                {!d.publishedAt && can("PUBLISH_DELIVERABLE") ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => postJson(`${base}/deliverables/${encodeURIComponent(d.id)}/publish`, {}), "تم نشر الملف للعميل.")}>نشر</Button> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-sm text-muted-foreground">لا توجد ملفات بعد.</p>}
        {detail.travelers.length > 1 && detail.executionStartedAt && detail.progress.delivery.missingTravelerIds.length ? (
          <p className="mt-2 text-xs text-muted-foreground">بانتظار ملف منشور لـ: {detail.progress.delivery.missingTravelerIds.map(nameOf).join("، ")}</p>
        ) : null}
        {can("PREPARE_DELIVERABLE") ? (
          <form
            // Remount when the release conditions change, so "publish now"
            // reflects them (defaultChecked only applies on first render).
            key={`${detail.paymentStatus}-${detail.executionStartedAt ?? "none"}`}
            className="mt-3 flex flex-col gap-2"
            data-testid="workflow-deliverable"
            onSubmit={(event) => {
              event.preventDefault();
              const formEl = event.currentTarget;
              const form = new FormData(formEl);
              const file = form.get("file");
              const label = String(form.get("label") || "").trim();
              if (!(file instanceof File) || !file.size || label.length < 2) return setError("اكتب اسم الملف واختر الملف.");
              const travelerIds = form.getAll("travelerIds").map(String);
              const publish = form.get("publish") === "true";
              if (publish && detail.travelers.length > 1 && travelerIds.length === 0) return setError("حدّد المسافرين الذين يخصهم هذا الملف.");
              const data = new FormData();
              data.append("label", label);
              data.append("file", file);
              if (travelerIds.length) data.append("travelerIds", JSON.stringify(travelerIds));
              data.append("publish", publish ? "true" : "false");
              void run(() => call(`${base}/deliverables`, { method: "POST", body: data }), publish ? "تم رفع الملف ونشره للعميل." : "تم حفظ الملف مسودة.").then(() => formEl.reset());
            }}
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs font-bold">اسم الملف<input name="label" maxLength={120} className="mt-1 h-9 w-56 rounded-lg border bg-background px-2 text-sm" /></label>
              <label className="flex flex-col text-xs font-bold">الملف<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 text-xs" /></label>
            </div>
            {detail.travelers.length > 1 ? (
              <fieldset className="flex flex-wrap gap-3 text-xs">
                <legend className="font-bold">يخص المسافرين (ملف مشترك: اختر كل من يغطيهم)</legend>
                {detail.travelers.map((t) => <label key={t.id} className="flex items-center gap-1"><input type="checkbox" name="travelerIds" value={t.id} /> {t.fullName}</label>)}
              </fieldset>
            ) : null}
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" name="publish" value="true" defaultChecked={can("PUBLISH_DELIVERABLE") || (detail.paymentStatus === "CONFIRMED" && Boolean(detail.executionStartedAt))} disabled={!(detail.paymentStatus === "CONFIRMED" && detail.executionStartedAt)} />
              نشره للعميل الآن (بعد قبول الدفع وبدء التنفيذ؛ وإلا يُحفظ مسودة)
            </label>
            <div><Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}رفع</Button></div>
          </form>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h4 className="font-black">إغلاق الطلب</h4>
        {can("COMPLETE") ? <Button type="button" size="sm" disabled={busy} className="mt-2" data-testid="workflow-complete" onClick={() => void run(() => call(`${base}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED", outcome: "COMPLETED" }) }), "تم إغلاق الطلب كمكتمل.")}>إغلاق كمكتمل</Button> : null}
        {can("CLOSE") ? (
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const outcomeNote = String(form.get("outcomeNote") || "").trim();
              void run(() => call(`${base}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED", outcome: form.get("outcome"), outcomeNote: outcomeNote || undefined }) }), "تم إغلاق الطلب.");
            }}
          >
            <label className="flex flex-col text-xs font-bold">النتيجة<select name="outcome" className="mt-1 h-9 rounded-lg border bg-background px-2 text-sm"><option value="CANCELLED">ملغي</option><option value="REJECTED">مرفوض</option></select></label>
            <label className="flex flex-col text-xs font-bold">ملاحظة{detail.paymentStatus === "CONFIRMED" ? " (إلزامية بعد الدفع: كيف يُعالج المبلغ)" : ""}<input name="outcomeNote" maxLength={2000} className="mt-1 h-9 w-64 rounded-lg border bg-background px-2 text-sm" /></label>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>إغلاق</Button>
          </form>
        ) : null}
        {can("REOPEN") ? (
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = String(new FormData(event.currentTarget).get("reason") || "").trim();
              if (reason.length < 5) return setError("اكتب سبب إعادة الفتح (5 أحرف على الأقل).");
              void run(() => call(`${base}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CONTACTED", reason }) }), "تم إعادة فتح الطلب.");
            }}
          >
            <label className="flex flex-col text-xs font-bold">إعادة الفتح — السبب (إلزامي، يُسجَّل)<input name="reason" className="mt-1 h-9 w-64 rounded-lg border bg-background px-2 text-sm" /></label>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>إعادة فتح</Button>
          </form>
        ) : null}
        {detail.status === "CLOSED" && !can("REOPEN") ? <p className="mt-1 text-xs text-muted-foreground">إعادة الفتح من صلاحيات الإدارة.</p> : null}
      </section>
    </div>
  );
}
