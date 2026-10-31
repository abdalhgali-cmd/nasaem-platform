"use client";

import * as React from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, FileText, Loader2, Mail, Plane, ShieldCheck, Ticket } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { egyptSignal, formatDateTime } from "@/components/admin/operations/ops-model";
import { Notice, SignalBadge, btn, cx } from "@/components/admin/operations/ops-ui";
import {
  CIRCULAR_AR,
  ENTRY_AR,
  FLIGHT_CHOICE_AR,
  PRIORITY_AR,
  QUALITY_AR,
  RECEIPT_EMAIL_AR,
  RECEIPT_ERROR_AR,
  REMINDER_AR,
  REMINDER_KIND_AR,
  deliverableFileUrl,
  egyptToday,
  whenText,
  type Deliverable,
  type EgyptWorkspace,
} from "./egypt-model";

// The Egypt security-approval workspace inside a case, the Next.js counterpart
// of the back-office panel (backend/public/assets/egypt-view.js). It reads
// GET /contact-requests/:id/egypt and calls only the existing transitions:
//   PATCH /:id/priority, POST /:id/egypt/approval, PATCH /:id/egypt/travel-date,
//   POST /:id/egypt/tickets, PATCH /:id/egypt/flight-details,
//   POST /:id/egypt/circular/processing, POST /:id/egypt/circular,
//   POST /:id/payment-receipt/resend.
// The server re-checks role (SUPER_ADMIN, ADMIN, EMPLOYEE), organisation and
// state for each one and writes the audit record; this panel never decides
// whether a transition is allowed beyond hiding forms the back-office hides.

type PanelTraveler = { id: string; fullName: string | null };

const field = "mt-1 h-10 w-full rounded-[10px] border border-[var(--nh-line-strong)] bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring";
const label = "text-xs font-bold text-muted-foreground";

async function send(path: string, init: RequestInit) {
  const res = await fetch(`${API_URL}/contact-requests${path}`, { credentials: "include", ...init });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) throw new Error(payload?.message || "تعذر تنفيذ العملية");
  return payload;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function Section({ title, icon, children, testId }: { title: string; icon: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-4" data-testid={testId}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold">{icon}{title}</h3>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

function Versions({ requestId, files, travelers, showIssued = false }: { requestId: string; files: Deliverable[]; travelers: PanelTraveler[]; showIssued?: boolean }) {
  if (!files.length) return <p className="text-muted-foreground">لا يوجد.</p>;
  const nameOf = (id: string) => travelers.find((t) => t.id === id)?.fullName || "—";
  return (
    <ul className="space-y-2">
      {files.map((d) => (
        <li key={d.id} data-egypt-file={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-muted px-3 py-2">
          <a href={deliverableFileUrl(API_URL, requestId, d.id)} target="_blank" rel="noopener" className="font-bold text-[var(--nh-primary-ink)] underline-offset-2 hover:underline">{d.label} (نسخة {d.version})</a>
          <span className={cx("rounded-md px-2 text-xs font-bold", d.supersededAt ? "bg-card text-muted-foreground" : "bg-[var(--nh-success-soft)] text-[var(--nh-success-ink)]")}>{d.supersededAt ? "نسخة سابقة" : "الحالية — يراها العميل"}</span>
          {showIssued && d.issuedOn ? <span className="text-xs text-muted-foreground">تاريخ الإصدار <span dir="ltr">{String(d.issuedOn).slice(0, 10)}</span></span> : null}
          {d.travelerIds?.length ? <span className="text-xs text-muted-foreground">يخص: {d.travelerIds.map(nameOf).join("، ")}</span> : null}
          <span className="text-xs text-muted-foreground">{formatDateTime(d.publishedAt || d.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function Submit({ busy, children, primary = false }: { busy: boolean; children: React.ReactNode; primary?: boolean }) {
  return (
    <button type="submit" disabled={busy} className={cx(btn.base, primary ? btn.primary : btn.secondary, btn.sm, "w-fit")}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}{children}
    </button>
  );
}

export function EgyptCasePanel({ caseId, travelers, onChanged }: { caseId: string; travelers: PanelTraveler[]; onChanged: () => void }) {
  const [ws, setWs] = React.useState<EgyptWorkspace | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await send(`/${encodeURIComponent(caseId)}/egypt`, {});
        if (!cancelled) { setWs(payload.data); setLoadError(""); }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "تعذر تحميل بيانات الموافقة الأمنية");
      }
    })();
    return () => { cancelled = true; };
  }, [caseId, reload]);

  async function act(key: string, run: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      setMessage({ tone: "success", text: success });
      form?.reset();
      setReload((n) => n + 1);
      onChanged();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "تعذر تنفيذ العملية" });
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <Notice tone="error">{loadError}</Notice>;
  if (!ws) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" />جارٍ تحميل بيانات الموافقة الأمنية…</p>;

  const base = `/${encodeURIComponent(caseId)}`;
  const open = ws.status !== "CLOSED";
  const today = egyptToday();
  const route = ws.route || {};
  const signal = egyptSignal(ws);
  const delivery = ws.receiptDeliveries?.[0];
  const flight = ws.flightDetails || {};

  function onApproval(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size || !f.get("issuedOn")) { setMessage({ tone: "error", text: "اختر تاريخ الإصدار والملف." }); return; }
    const ids = f.getAll("travelerIds").map(String);
    if (travelers.length > 1 && !ids.length) { setMessage({ tone: "error", text: "حدّد المسافرين الذين تشملهم الموافقة." }); return; }
    const data = new FormData();
    data.append("issuedOn", String(f.get("issuedOn")));
    data.append("file", file);
    if (ids.length) data.append("travelerIds", JSON.stringify(ids));
    act("approval", () => send(`${base}/egypt/approval`, { method: "POST", body: data }), "تم تسجيل إصدار الموافقة وإبلاغ العميل.", form);
  }

  function onCircular(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const file = f.get("file");
    if (!(file instanceof File) || !/\.pdf$/i.test(file.name)) { setMessage({ tone: "error", text: "التعميم يُرفع ملف PDF فقط." }); return; }
    const data = new FormData();
    if (f.get("issuedOn")) data.append("issuedOn", String(f.get("issuedOn")));
    data.append("file", file);
    act("circular", () => send(`${base}/egypt/circular`, { method: "POST", body: data }), "تم رفع التعميم وإبلاغ العميل.", form);
  }

  function onTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) { setMessage({ tone: "error", text: "اختر ملف التذكرة." }); return; }
    const data = new FormData();
    data.append("file", file);
    act("ticket", () => send(`${base}/egypt/tickets`, { method: "POST", body: data }), "تم إرفاق التذكرة وإبلاغ العميل.", form);
  }

  function onTravelDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    act("travel", () => send(`${base}/egypt/travel-date`, json("PATCH", { entryDate: String(f.get("entryDate") || ""), reason: String(f.get("reason") || "").trim() })), "تم حفظ تاريخ السفر وتحديث التذكيرات.");
  }

  function onPriority(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    act("priority", () => send(`${base}/priority`, json("PATCH", { priority: String(f.get("priority")), dueAt: String(f.get("dueAt") || "") || null })), "تم حفظ الأولوية وموعد الإنجاز.");
  }

  function onFlight(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    // Every flight field is sent: an emptied field clears the stored value.
    const body: Record<string, unknown> = { verified: f.get("verified") === "on" };
    for (const key of ["flightNumber", "airline", "departureTime", "arrivalTime"]) body[key] = String(f.get(key) || "").trim() || null;
    const reason = String(f.get("reason") || "").trim();
    if (reason) body.reason = reason;
    act("flight", () => send(`${base}/egypt/flight-details`, json("PATCH", body)), body.verified ? "تم حفظ بيانات الرحلة والتحقق منها." : "تم حفظ بيانات الرحلة.");
  }

  function onResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    act("resend", () => send(`${base}/payment-receipt/resend`, json("POST", email ? { email } : {})), "تمت إعادة إرسال الإيصال.");
  }

  return (
    <div className="space-y-4" id="egypt-workspace" data-egypt-stage={ws.stage}>
      {/* Summary: stage, entry, travel date and the server's next action. */}
      <div className="rounded-[14px] border border-[color-mix(in_srgb,var(--nh-nile)_30%,transparent)] bg-[var(--nh-nile-soft)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-card px-2 py-0.5 text-xs font-bold text-[var(--nh-nile-ink)]" data-testid="egypt-stage">{ws.stageLabel}</span>
          {signal ? <SignalBadge signal={signal} /> : null}
          {ws.priority && ws.priority !== "NORMAL" ? <span className="rounded-md bg-card px-2 py-0.5 text-xs font-bold">أولوية {PRIORITY_AR[ws.priority] || ws.priority}</span> : null}
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className={label}>الدخول</dt><dd className="font-bold">{ws.entryMode ? ENTRY_AR[ws.entryMode] : "—"}
            <span className="block text-xs font-normal text-muted-foreground">{ws.entryMode === "AIR" ? `من ${route.departureCity || "-"} إلى ${route.arrivalAirport || "-"}` : ws.entryMode === "BORDER" ? `المنفذ: ${route.entryPort || "غير محدد"}` : ""}</span></dd></div>
          <div><dt className={label}>تاريخ السفر</dt><dd className="font-bold">{ws.travelDate ? <><span dir="ltr" className="tabular-nums">{ws.travelDate}</span> <span className="text-xs font-normal text-muted-foreground">{whenText(ws.daysUntil)}</span></> : <span className="text-[var(--nh-warning-ink)]">بلا تاريخ</span>}</dd></div>
          <div><dt className={label}>الإجراء التالي</dt><dd className="font-bold text-[var(--nh-primary-ink)]" data-egypt-next="1">{ws.nextAction || "—"}</dd></div>
        </dl>
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {!open ? <Notice tone="info">الطلب مغلق: العرض للاطلاع فقط.</Notice> : null}
      {ws.approvalIssued && !ws.preparationComplete ? (
        <div className="flex items-start gap-2 rounded-[14px] border border-[color-mix(in_srgb,var(--nh-warning)_35%,transparent)] bg-[var(--nh-warning-soft)] p-3 text-sm font-bold text-[var(--nh-warning-ink)]" data-egypt-prep-missing="1">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />تجهيز السفر ناقص (الموافقة تبقى صادرة): {ws.preparationMissing.join("، ")}
        </div>
      ) : null}

      {/* Re-mounted after each action so the forms show the saved values. */}
      <div key={reload} className="grid gap-4">
        <Section title="الموافقة الأمنية" icon={<ShieldCheck className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-approval">
          <Versions requestId={caseId} files={ws.approvals} travelers={travelers} showIssued />
          {open ? (
            <form onSubmit={onApproval} className="space-y-3 rounded-[10px] border border-dashed border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>تاريخ الإصدار<input name="issuedOn" type="date" max={today} defaultValue={today} required className={field} /></label>
                <label className={label}>صورة/ملف الموافقة<input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required className={cx(field, "py-1.5")} /></label>
              </div>
              {travelers.length > 1 ? (
                <fieldset><legend className={label}>المسافرون الذين تشملهم</legend>
                  <div className="mt-1 flex flex-wrap gap-3">{travelers.map((t) => <label key={t.id} className="inline-flex items-center gap-2"><input type="checkbox" name="travelerIds" value={t.id} defaultChecked />{t.fullName || "—"}</label>)}</div>
                </fieldset>
              ) : null}
              <p className="text-xs leading-6 text-muted-foreground">يُحفظ الملف ويُتحقق منه أولًا، ثم تُسجَّل الموافقة صادرة ويُبلَّغ العميل. نسخة جديدة تستبدل السابقة لنفس المسافرين.</p>
              <Submit busy={busy === "approval"} primary>{ws.approvals.length ? "إصدار نسخة جديدة" : "تسجيل إصدار الموافقة"}</Submit>
            </form>
          ) : null}
        </Section>

        <Section title="التعميم" icon={<FileText className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-circular">
          <p>الحالة: <strong data-egypt-circular={ws.circularStatus || ""}>{CIRCULAR_AR[ws.circularStatus || ""] || "—"}</strong></p>
          <Versions requestId={caseId} files={ws.circulars} travelers={travelers} showIssued />
          {open && ws.approvalIssued ? (
            <>
              {ws.circularStatus === "NOT_STARTED" ? (
                <button type="button" disabled={busy === "processing"} onClick={() => act("processing", () => send(`${base}/egypt/circular/processing`, json("POST", {})), "بدأ تجهيز التعميم.")} className={cx(btn.base, btn.secondary, btn.sm)}>
                  {busy === "processing" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}بدء تجهيز التعميم
                </button>
              ) : null}
              <form onSubmit={onCircular} className="space-y-3 rounded-[10px] border border-dashed border-border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>تاريخ إصدار التعميم<input name="issuedOn" type="date" max={today} defaultValue={today} required className={field} /></label>
                  <label className={label}>ملف التعميم (PDF فقط)<input name="file" type="file" accept="application/pdf,.pdf" required className={cx(field, "py-1.5")} /></label>
                </div>
                <Submit busy={busy === "circular"} primary>رفع التعميم وإبلاغ العميل</Submit>
              </form>
              <p className="text-xs text-muted-foreground">التعميم مستند رسمي يُرفع كما صدر؛ لا يُنشئه النظام.</p>
            </>
          ) : <p className="text-xs text-muted-foreground">يُجهَّز التعميم بعد إصدار الموافقة واكتمال بيانات السفر.</p>}
        </Section>

        <Section title="تاريخ السفر والأولوية" icon={<CalendarDays className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-schedule">
          {open ? (
            <>
              <form onSubmit={onTravelDate} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <label className={label}>تاريخ السفر<input name="entryDate" type="date" min={today} defaultValue={ws.travelDate || ""} required className={field} /></label>
                <label className={label}>السبب (يُسجَّل)<input name="reason" minLength={3} maxLength={300} required className={field} /></label>
                <Submit busy={busy === "travel"}>حفظ التاريخ</Submit>
              </form>
              {ws.circularStatus === "ISSUED" ? <p className="text-xs text-[var(--nh-warning-ink)]">تغيير التاريخ بعد صدور التعميم يسحب التعميم الحالي ويعيده إلى «قيد التجهيز».</p> : null}
              <form onSubmit={onPriority} className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className={label}>الأولوية<select name="priority" defaultValue={ws.priority || "NORMAL"} className={field}>{Object.entries(PRIORITY_AR).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
                <label className={label}>موعد الإنجاز<input name="dueAt" type="date" defaultValue={ws.dueAt ? String(ws.dueAt).slice(0, 10) : ""} className={field} /></label>
                <Submit busy={busy === "priority"}>حفظ الأولوية</Submit>
              </form>
            </>
          ) : null}
          <details className="rounded-[10px] bg-muted px-3 py-2">
            <summary className="cursor-pointer text-xs font-bold">تذكيرات الفريق ({ws.reminders.length})</summary>
            {ws.reminders.length ? (
              <ul className="mt-2 space-y-1 text-xs">{ws.reminders.map((m) => <li key={m.id}>{REMINDER_KIND_AR[m.kind] || m.kind} · سفر <span dir="ltr">{m.travelDate}</span> · {REMINDER_AR[m.status] || m.status}{m.sentAt || m.dueAt ? <> · {formatDateTime((m.sentAt || m.dueAt) as string)}</> : null}</li>)}</ul>
            ) : <p className="mt-2 text-xs text-muted-foreground">لا توجد تذكيرات (لا يوجد تاريخ سفر).</p>}
          </details>
        </Section>

        <Section title={ws.entryMode === "BORDER" ? "تذاكر الرحلة" : "تذاكر الطيران"} icon={<Ticket className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-tickets">
          <Versions requestId={caseId} files={ws.tickets} travelers={travelers} />
          <p className="text-xs text-muted-foreground">خيار العميل: {FLIGHT_CHOICE_AR[ws.flightChoice || ""] || "لم يحدد"}{ws.linkedInquiry ? <> · <a className="font-bold text-[var(--nh-primary-ink)] hover:underline" href={`/admin/cases?requestId=${encodeURIComponent(ws.linkedInquiry.id)}`}>طلب الحجز المرتبط</a> (لا يؤثر على الموافقة)</> : null}</p>
          {open ? (
            <form onSubmit={onTicket} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className={label}>رفع تذكرة<input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required className={cx(field, "py-1.5")} /></label>
              <Submit busy={busy === "ticket"}>إرفاق التذكرة للعميل</Submit>
            </form>
          ) : null}
        </Section>

        {ws.entryMode === "AIR" ? (
          <Section title="بيانات الرحلة" icon={<Plane className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-flight">
            <p>{ws.flightDetails
              ? flight.verifiedAt
                ? <span className="inline-flex items-center gap-1 rounded-md bg-[var(--nh-success-soft)] px-2 text-xs font-bold text-[var(--nh-success-ink)]" data-egypt-flight-verified="1"><CheckCircle2 className="size-3.5" aria-hidden="true" />تم التحقق · {formatDateTime(flight.verifiedAt)}</span>
                : <span className="rounded-md bg-[var(--nh-warning-soft)] px-2 text-xs font-bold text-[var(--nh-warning-ink)]">لم يُتحقق منها بعد{flight.source === "CUSTOMER" ? " (أدخلها العميل)" : ""}</span>
              : <span className="text-xs text-muted-foreground">لم تُسجَّل بيانات الرحلة.</span>}</p>
            {open ? (
              <form onSubmit={onFlight} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>رقم الرحلة<input name="flightNumber" dir="ltr" maxLength={12} defaultValue={flight.flightNumber || ""} className={field} /></label>
                  <label className={label}>شركة الطيران<input name="airline" maxLength={80} defaultValue={flight.airline || ""} className={field} /></label>
                  <label className={label}>وقت الإقلاع<input name="departureTime" type="time" defaultValue={flight.departureTime || ""} className={field} /></label>
                  <label className={label}>وقت الوصول<input name="arrivalTime" type="time" defaultValue={flight.arrivalTime || ""} className={field} /></label>
                </div>
                <label className={label}>ملاحظة التعديل (تُسجَّل)<input name="reason" maxLength={300} className={field} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={Boolean(flight.verifiedAt)} />تم التحقق من البيانات مقابل التذكرة</label>
                {ws.circularStatus === "ISSUED" ? <p className="text-xs text-[var(--nh-warning-ink)]">تغيير بيانات الرحلة بعد صدور التعميم يسحب التعميم الحالي ويعيده إلى «قيد التجهيز».</p> : null}
                <Submit busy={busy === "flight"}>حفظ بيانات الرحلة</Submit>
              </form>
            ) : null}
          </Section>
        ) : null}

        <Section title="إيصال السداد" icon={<Mail className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-receipt">
          {ws.receipt ? (
            <p>رقم <span dir="ltr">{ws.receipt.receiptNo}</span> · {ws.receipt.pdfStatus === "READY"
              ? <a className="font-bold text-[var(--nh-primary-ink)] hover:underline" href={`${API_URL}/contact-requests/${encodeURIComponent(caseId)}/payment-receipt/file`} target="_blank" rel="noopener">تحميل PDF</a>
              : ws.receipt.pdfStatus === "FAILED" ? "تعذر إنشاء الملف" : "جارٍ إنشاء الملف"}</p>
          ) : <p className="text-xs text-muted-foreground">يصدر تلقائيًا عند تأكيد الدفع. تأكيد الدفع نفسه يتم من صفحة مراجعة الدفعات.</p>}
          {delivery ? (
            <>
              <p className="text-xs text-muted-foreground">البريد: <span dir="ltr">{delivery.recipient || "—"}</span> · {RECEIPT_EMAIL_AR[delivery.status] || delivery.status}{delivery.lastError ? ` · ${RECEIPT_ERROR_AR[delivery.lastError] || delivery.lastError}` : ""}</p>
              <form onSubmit={onResend} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className={label}>بريد العميل (اختياري للتصحيح)<input name="email" type="email" dir="ltr" defaultValue={delivery.recipient || ""} className={field} /></label>
                <Submit busy={busy === "resend"}>إعادة إرسال الإيصال</Submit>
              </form>
            </>
          ) : null}
        </Section>

        <Section title="جودة صور الجواز" icon={<AlertTriangle className="size-4 text-[var(--nh-nile)]" aria-hidden="true" />} testId="egypt-quality">
          {ws.passportQuality.length ? (
            <>
              <ul className="space-y-1">{ws.passportQuality.map((q) => (
                <li key={q.documentId}>{q.label}: {q.warnings.length
                  ? q.warnings.map((w) => <span key={w} className="me-1 rounded-md bg-[var(--nh-warning-soft)] px-2 text-xs font-bold text-[var(--nh-warning-ink)]">{QUALITY_AR[w] || w}</span>)
                  : <span className="text-xs text-muted-foreground">لا ملاحظات</span>}</li>
              ))}</ul>
              <p className="text-xs text-muted-foreground">ملاحظات قاسها جهاز العميل؛ للمساعدة فقط ولا ترفض المستند. القرار لمراجعة الموظف في تبويب المستندات.</p>
            </>
          ) : <p className="text-xs text-muted-foreground">لا توجد ملاحظات جودة على صور الجواز.</p>}
        </Section>
      </div>
    </div>
  );
}
