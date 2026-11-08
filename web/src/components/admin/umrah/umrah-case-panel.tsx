"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, FileText, ShieldCheck, Users } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { formatAmount, formatDay, paymentLabel } from "@/components/admin/operations/ops-model";
import { SignalBadge, btn, cx } from "@/components/admin/operations/ops-ui";
import { isGuarantorResidenceDocument } from "./guarantor";
import { VisaStateControl, type VisaStateValue } from "./visa-state-control";
import { DOCUMENT_STATUS_AR, GUARANTOR_RESIDENCE, packageKind, stageLabel, umrahRowSignal, type UmrahListRow } from "./umrah-model";

// The Umrah view of a case, inside /admin/cases (tab «العمرة»). Read-only
// summary of what the server already computes for the request — stage,
// steps, next step, blockers, guarantor and per-pilgrim documents and final
// files — with shortcuts to the existing tabs where the work is done
// (documents review, workflow: execution, final files, closing). No action
// or rule is added here; payment decisions stay on «مراجعة الدفعات».

type Doc = { id: string; requirementId?: string | null; label: string; status: string; travelerId: string | null; supersededAt: string | null; classification?: string; reviewNote?: string | null };
type SnapshotRequirement = { id: string; attachmentType?: string | null; name?: string; type?: string; scope?: string; required?: boolean };
export type UmrahCase = Omit<UmrahListRow, "travelers"> & { documents: Doc[]; travelers: { id: string; fullName: string | null; passportNo?: string | null; visaState?: VisaStateValue | null; visaStateReason?: string | null; visaFollowUpAt?: string | null }[]; allowedActions?: string[]; requirementsSnapshot?: SnapshotRequirement[] | null };
export type CaseTabKey = "documents" | "workflow" | "travelers" | "activity" | "overview";

function StatusChip({ status }: { status: string }) {
  const style = status === "ACCEPTED" ? "bg-[var(--nh-success-soft)] text-[var(--nh-success-ink)]" : status === "REJECTED" ? "bg-[var(--nh-danger-soft)] text-[var(--nh-danger-ink)]" : "bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]";
  return <span className={cx("rounded-md px-2 text-xs font-bold", style)}>{DOCUMENT_STATUS_AR[status] || status}</span>;
}

function Section({ title, icon, children, testId }: { title: string; icon: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-4" data-testid={testId}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold">{icon}{title}</h3>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

// Ask the customer for one specific missing or rejected document (POST
// /document-requests): the server refuses one that is accepted or under
// review, records who asked, and notifies the customer.
function DocumentRequestForm({ caseRow }: { caseRow: UmrahCase }) {
  const requirements = (caseRow.requirementsSnapshot || []).filter((r) => (!r.type || r.type === "DOCUMENT") && r.name);
  const [requirementId, setRequirementId] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (!requirements.length || caseRow.status === "CLOSED") return null;
  const perPilgrim = requirements.find((r) => r.id === requirementId)?.scope === "TRAVELER" && caseRow.travelers.length > 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const travelerId = String(form.get("travelerId") || "");
    const note = String(form.get("note") || "").trim();
    if (!requirementId) return setMessage({ tone: "error", text: "اختر المستند المطلوب." });
    if (perPilgrim && !travelerId) return setMessage({ tone: "error", text: "اختر المعتمر الذي يخصه المستند." });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(caseRow.id)}/document-requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId, ...(travelerId ? { travelerId } : {}), ...(note ? { note } : {}) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "تعذّر إرسال الطلب.");
      setMessage({ tone: "ok", text: "أُرسل طلب المستند للعميل وسُجّل في السجل." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "تعذّر إرسال الطلب." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={submit} data-testid="umrah-document-request">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-bold">المستند
          <select value={requirementId} onChange={(e) => setRequirementId(e.target.value)} className="mt-1 h-9 rounded-lg border bg-background px-2 text-sm">
            <option value="">— اختر —</option>
            {requirements.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        {perPilgrim ? (
          <label className="flex flex-col text-xs font-bold">المعتمر
            <select name="travelerId" defaultValue="" className="mt-1 h-9 rounded-lg border bg-background px-2 text-sm">
              <option value="">— اختر —</option>
              {caseRow.travelers.map((t) => <option key={t.id} value={t.id}>{t.fullName || "—"}</option>)}
            </select>
          </label>
        ) : null}
        <label className="flex min-w-48 flex-1 flex-col text-xs font-bold">ملاحظة للعميل (اختياري)
          <input name="note" maxLength={500} className="mt-1 h-9 rounded-lg border bg-background px-2 text-sm" />
        </label>
        <button type="submit" disabled={busy} className={cx(btn.base, btn.secondary, btn.sm)}>طلب المستند</button>
      </div>
      {message ? <p role="status" className={cx("text-xs font-bold", message.tone === "ok" ? "text-[var(--nh-success-ink)]" : "text-[var(--nh-danger-ink)]")}>{message.text}</p> : null}
      <p className="text-xs text-muted-foreground">للمستند الناقص أو المرفوض فقط. المستند قيد المراجعة يُقبل أو يُرفض بسبب من «مراجعة المستندات».</p>
    </form>
  );
}

export function UmrahCasePanel({ caseRow, onOpenTab }: { caseRow: UmrahCase; onOpenTab: (tab: CaseTabKey) => void }) {
  const [now] = React.useState(() => Date.now());
  // Who is looking, and who owns the request: a regular employee changes an
  // Umrah request only while it is assigned to them (server rule, T10); an
  // unassigned one is taken with the explicit claim below.
  const [me, setMe] = React.useState<{ id: string; role: string } | null>(null);
  const [assignee, setAssignee] = React.useState<{ id: string; fullName: string } | null>(caseRow.assignedUser ? { id: caseRow.assignedUser.id, fullName: caseRow.assignedUser.fullName } : null);
  const [claim, setClaim] = React.useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  React.useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: "include" }).then((r) => r.json()).then((p) => { if (p?.success) setMe({ id: p.data.id, role: p.data.role }); }).catch(() => undefined);
  }, []);
  async function claimRequest() {
    setClaim({ busy: true, error: "" });
    try {
      const res = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(caseRow.id)}/claim`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "تعذّر استلام الطلب.");
      if (me) setAssignee({ id: me.id, fullName: "أنت" });
      setClaim({ busy: false, error: "" });
    } catch (error) {
      setClaim({ busy: false, error: error instanceof Error ? error.message : "تعذّر استلام الطلب." });
    }
  }
  const isManager = me ? ["SUPER_ADMIN", "ADMIN"].includes(me.role) : false;
  const canWork = Boolean(me) && (isManager || (me!.role === "EMPLOYEE" && assignee?.id === me!.id));
  const canClaim = Boolean(me) && !assignee && ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(me!.role) && caseRow.status !== "CLOSED";
  // The staff next step (umrah-staff-queue.js) is computed for list rows only,
  // so it is read from the request's own row of GET /contact-requests.
  const [queue, setQueue] = React.useState<{ for: string; value: UmrahListRow["umrahQueue"] } | null>(null);
  const version = `${caseRow.id}:${caseRow.updatedAt}:${caseRow.paymentStatus}:${caseRow.documents.map((d) => d.status).join(",")}`;
  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ serviceKind: "UMRAH", search: caseRow.id, limit: "1" });
    fetch(`${API_URL}/contact-requests?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((payload) => {
        const row = (payload?.data as UmrahListRow[] | undefined)?.find((r) => r.id === caseRow.id);
        if (!cancelled) setQueue({ for: version, value: row?.umrahQueue ?? null });
      })
      .catch(() => { if (!cancelled) setQueue({ for: version, value: null }); });
    return () => { cancelled = true; };
  }, [caseRow.id, version]);
  const umrahQueue = caseRow.umrahQueue ?? (queue?.for === version ? queue.value : null);
  const progress = caseRow.progress || {};
  const kind = packageKind(caseRow);
  const signal = umrahRowSignal(caseRow, now);
  const contacts = caseRow.intakeData?.umrahContacts || {};
  const travel = caseRow.intakeData?.umrahTravel || {};
  const current = caseRow.documents.filter((d) => !d.supersededAt);
  const residence = current.filter((d) => isGuarantorResidenceDocument(d, caseRow.requirementsSnapshot));
  const covered = new Set(progress.delivery?.coveredTravelerIds || []);
  // «رحلتي إلى الحرمين» per pilgrim (server: progress.umrah).
  const umrahJourney = (progress as { umrah?: { pilgrims?: { id: string; visa: string; services?: string }[] } | null }).umrah;
  const amount = caseRow.invoice ? formatAmount(caseRow.invoice.amount, caseRow.invoice.currency) : progress.pricing ? formatAmount(progress.pricing.total, progress.pricing.currency) : null;
  const fileUrl = (id: string) => `${API_URL}/contact-requests/${encodeURIComponent(caseRow.id)}/documents/${encodeURIComponent(id)}/file`;

  return (
    <div className="space-y-4" id="umrah-workspace" data-umrah-stage={progress.stage}>
      <div className="rounded-[14px] border border-[var(--nh-gold-100)] bg-[var(--nh-gold-50)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-card px-2 py-0.5 text-xs font-bold text-[var(--nh-gold-700)]" data-testid="umrah-stage">{stageLabel(caseRow)}</span>
          {signal ? <SignalBadge signal={signal} /> : null}
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-bold text-muted-foreground">الباقة</dt><dd className="font-bold">{caseRow.serviceRef?.name || "—"}<span className="block text-xs font-normal text-muted-foreground" data-testid="umrah-kind">{kind.label || "النوع غير محدد"}</span></dd></div>
          <div><dt className="text-xs font-bold text-muted-foreground">السفر المفضل</dt><dd className="font-bold">{travel.preferredDate ? <><span dir="ltr">{travel.preferredDate}</span><span className="block text-xs font-normal text-muted-foreground">مبدئي، ليس حجزًا</span></> : travel.preferredDateMissing ? <span className="text-[var(--nh-warning-ink)]">لم يُحدد</span> : "غير مطلوب لهذه الباقة"}</dd></div>
          <div><dt className="text-xs font-bold text-muted-foreground">الدفع</dt><dd className="font-bold" data-testid="umrah-payment">{paymentLabel(caseRow.paymentStatus)}{amount ? <span className="block text-xs font-normal tabular-nums text-muted-foreground" dir="ltr">{amount}</span> : null}</dd></div>
          <div><dt className="text-xs font-bold text-muted-foreground">الإجراء التالي</dt><dd className="font-bold text-[var(--nh-primary-ink)]" data-umrah-next="1">{umrahQueue?.nextAction || (queue?.for === version ? "—" : "…")}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground" data-testid="umrah-assignee">المسؤول: {assignee?.fullName || "غير مُسند"}{caseRow.dueAt ? ` · موعد الإنجاز ${formatDay(caseRow.dueAt)}` : ""}</p>
        {canClaim ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={claim.busy} onClick={claimRequest} className={cx(btn.base, btn.primary, btn.sm)} data-testid="umrah-claim">{claim.busy ? "جارٍ الاستلام…" : "استلام الطلب"}</button>
            <span className="text-xs text-muted-foreground">الطلب غير مُسند؛ استلمه لتبدأ العمل عليه.</span>
          </div>
        ) : null}
        {me && !canWork && !canClaim && me.role === "EMPLOYEE" && assignee ? <p role="note" className="mt-2 text-xs font-bold text-[var(--nh-warning-ink)]" data-testid="umrah-readonly">هذا الطلب مُسند إلى {assignee.fullName}؛ تعرضه للقراءة فقط. يعيد المدير إسناده إذا لزم.</p> : null}
        {claim.error ? <p role="alert" className="mt-2 text-xs font-bold text-[var(--nh-danger-ink)]">{claim.error}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={cx(btn.base, btn.secondary, btn.sm)} onClick={() => onOpenTab("documents")}>مراجعة المستندات</button>
        <button type="button" className={cx(btn.base, btn.secondary, btn.sm)} onClick={() => onOpenTab("workflow")}>سير العمل والتنفيذ والملفات النهائية</button>
        {progress.stage === "PAYMENT_REVIEW" ? <Link href="/admin/payment-review" className={cx(btn.base, btn.primary, btn.sm)}>مراجعة إيصال الدفع</Link> : null}
        <button type="button" className={cx(btn.base, btn.ghost, btn.sm)} onClick={() => onOpenTab("activity")}>السجل</button>
      </div>

      {progress.blockers?.length && caseRow.status !== "CLOSED" ? (
        <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--nh-warning)_35%,transparent)] bg-[var(--nh-warning-soft)] p-3 text-sm text-[var(--nh-warning-ink)]" data-testid="umrah-blockers">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="size-4" aria-hidden="true" />قبل بدء التنفيذ:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">{progress.blockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>
        </div>
      ) : null}

      <Section title="مراحل المعالجة" icon={<CircleDot className="size-4 text-[var(--nh-gold-700)]" aria-hidden="true" />} testId="umrah-steps">
        <ol className="space-y-2">
          {(progress.steps || []).map((step) => {
            const Icon = step.state === "done" ? CheckCircle2 : step.state === "current" ? CircleDot : Circle;
            return (
              <li key={step.key} data-step={step.key} data-state={step.state} className={cx("flex gap-3 rounded-[10px] px-3 py-2", step.state === "current" ? "bg-[var(--nh-primary-soft)]" : "")}>
                <Icon className={cx("mt-0.5 size-4 shrink-0", step.state === "done" ? "text-[var(--nh-success)]" : step.state === "current" ? "text-[var(--nh-primary-ink)]" : "text-muted-foreground")} aria-hidden="true" />
                <span><span className={cx("font-bold", step.state === "upcoming" && "text-muted-foreground")}>{step.label}</span>{step.status ? <span className="block text-xs text-muted-foreground">{step.status}</span> : null}</span>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section title="الضامن" icon={<ShieldCheck className="size-4 text-[var(--nh-gold-700)]" aria-hidden="true" />} testId="umrah-guarantor">
        <p>الهاتف: {contacts.guarantorPhone ? <span dir="ltr" className="font-bold">{contacts.guarantorPhone}</span> : <span className="font-bold text-[var(--nh-warning-ink)]">لم يُرسل — اطلبه من العميل</span>}</p>
        <div>
          <p className="text-xs font-bold text-muted-foreground">{GUARANTOR_RESIDENCE}</p>
          {residence.length ? (
            <ul className="mt-1 space-y-1">{residence.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2"><a href={fileUrl(d.id)} target="_blank" rel="noopener" className="font-bold text-[var(--nh-primary-ink)] hover:underline">{d.label}</a><StatusChip status={d.status} />{d.reviewNote ? <span className="text-xs text-muted-foreground">{d.reviewNote}</span> : null}</li>
            ))}</ul>
          ) : <p className="mt-1 text-xs font-bold text-[var(--nh-warning-ink)]">لم تُرفع بعد.</p>}
        </div>
      </Section>

      <Section title={`المعتمرون (${caseRow.travelers.length})`} icon={<Users className="size-4 text-[var(--nh-gold-700)]" aria-hidden="true" />} testId="umrah-pilgrims">
        <ul className="space-y-3">
          {caseRow.travelers.map((t) => {
            const docs = current.filter((d) => d.travelerId === t.id);
            return (
              <li key={t.id} data-pilgrim={t.id} className="rounded-[10px] border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{t.fullName || "—"}{t.passportNo ? <span className="ms-2 text-xs font-normal text-muted-foreground">الجواز <span dir="ltr">{t.passportNo}</span></span> : null}</span>
                  {(() => {
                    const journeyPilgrim = umrahJourney?.pilgrims?.find((p) => p.id === t.id);
                    if (!journeyPilgrim) return <span className={cx("rounded-md px-2 text-xs font-bold", covered.has(t.id) ? "bg-[var(--nh-success-soft)] text-[var(--nh-success-ink)]" : "bg-muted text-muted-foreground")}>{covered.has(t.id) ? "الملف النهائي منشور" : "لا ملف نهائي بعد"}</span>;
                    const ok = "bg-[var(--nh-success-soft)] text-[var(--nh-success-ink)]";
                    const idle = "bg-muted text-muted-foreground";
                    return (
                      <span className="flex flex-wrap gap-1">
                        <span data-visa-state={journeyPilgrim.visa} className={cx("rounded-md px-2 text-xs font-bold", journeyPilgrim.visa === "ISSUED" ? ok : journeyPilgrim.visa === "REJECTED" || journeyPilgrim.visa === "DELAYED" ? "bg-[var(--nh-warning-soft)] text-[var(--nh-warning-ink)]" : idle)}>{journeyPilgrim.visa === "ISSUED" ? "التأشيرة منشورة" : journeyPilgrim.visa === "REJECTED" ? "تأشيرة مرفوضة" : journeyPilgrim.visa === "DELAYED" ? "تأشيرة متأخرة" : "لا تأشيرة بعد"}</span>
                        {journeyPilgrim.services ? <span data-services-state={journeyPilgrim.services} className={cx("rounded-md px-2 text-xs font-bold", journeyPilgrim.services === "DELIVERED" ? ok : idle)}>{journeyPilgrim.services === "DELIVERED" ? "الخدمات مسلّمة" : "الخدمات لم تُسلّم"}</span> : null}
                      </span>
                    );
                  })()}
                </div>
                {caseRow.status !== "CLOSED" && caseRow.allowedActions?.includes("SET_VISA_STATE") && canWork && !covered.has(t.id) ? (
                  <VisaStateControl requestId={caseRow.id} travelerId={t.id} travelerName={t.fullName || "المعتمر"} initial={{ state: t.visaState ?? null, reason: t.visaStateReason, followUpAt: t.visaFollowUpAt }} />
                ) : null}
                {docs.length ? (
                  <ul className="mt-2 space-y-1">{docs.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs"><FileText className="size-3.5 text-muted-foreground" aria-hidden="true" /><a href={fileUrl(d.id)} target="_blank" rel="noopener" className="hover:underline">{d.label}</a><StatusChip status={d.status} /></li>)}</ul>
                ) : <p className="mt-1 text-xs text-[var(--nh-warning-ink)]">لا مستندات مرفوعة لهذا المعتمر.</p>}
              </li>
            );
          })}
        </ul>
      </Section>

      {caseRow.status !== "CLOSED" && (caseRow.requirementsSnapshot || []).length ? (
        <Section title="طلب مستند محدد من العميل" icon={<FileText className="size-4 text-[var(--nh-gold-700)]" aria-hidden="true" />} testId="umrah-request-document">
          <DocumentRequestForm caseRow={caseRow} />
        </Section>
      ) : null}

      {progress.completionBlockers?.length && caseRow.status !== "CLOSED" ? (
        <Section title="قبل إغلاق الطلب" icon={<AlertTriangle className="size-4 text-muted-foreground" aria-hidden="true" />} testId="umrah-completion">
          <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">{progress.completionBlockers.map((b) => <li key={b.code}>{b.message}</li>)}</ul>
        </Section>
      ) : null}
    </div>
  );
}
