"use client";

import * as React from "react";
import { Check, Download, Landmark, Package, Stamp } from "lucide-react";
import { API_URL } from "@/lib/api-url";

// «رحلتي إلى الحرمين» on the website. Renders the server's journey object
// (progress.umrah, backend umrah-journey.js) as is — the same one the app
// renders — so no stage or action is inferred in the browser.

export const UMRAH_NO_ACTION_MESSAGE = "لا يوجد إجراء مطلوب منك حالياً. سنُحدّث حالة طلبك عند اكتمال الخطوة التالية.";

type StageState = "done" | "current" | "upcoming" | "not_included";
type JourneyFile = { id: string; label: string; publishedAt?: string | null };

export type UmrahJourney = {
  title: string;
  reference: string;
  packageKind: "VISA_ONLY" | "AIR" | "SEA" | null;
  packageLabel: string;
  pilgrimCount: number;
  status: string;
  updatedAt: string | null;
  servicesIncluded: boolean;
  visasIssued: number;
  servicesDelivered: number | null;
  stages: { key: string; label: string; state: StageState; status: string }[];
  pilgrims: {
    id: string;
    name: string;
    visa: "ISSUED" | "IN_PROGRESS" | "PENDING" | "DELAYED" | "REJECTED";
    // Delayed / rejected only: the reason staff gave and the next follow-up day.
    visaReason?: string | null;
    visaFollowUpAt?: string | null;
    visaFiles: JourneyFile[];
    services?: "DELIVERED" | "PREPARING" | "PENDING";
    serviceFiles?: JourneyFile[];
  }[];
  now: {
    stepKey: string | null;
    stepLabel: string;
    actor: "CUSTOMER" | "AGENCY" | "NONE";
    actionRequired: boolean;
    message: string;
    noActionMessage?: string | null;
    nextStepLabel: string | null;
  };
  primaryAction: { key: string; label: string } | null;
  ticketBooking?: { available: boolean; inquiryId: string | null; status: string | null; mode: "AIR" | "SEA" };
};

const VISA_STATE = { ISSUED: "صدرت التأشيرة", IN_PROGRESS: "قيد الإجراءات", PENDING: "لم تبدأ بعد", DELAYED: "تأشيرة متأخرة", REJECTED: "تأشيرة مرفوضة" } as const;
const SERVICE_STATE = { DELIVERED: "سُلّمت الخدمات", PREPARING: "قيد التجهيز", PENDING: "لم تبدأ بعد" } as const;
const ACTOR = { CUSTOMER: "مطلوب منك", AGENCY: "الوكالة", NONE: "—" } as const;
const STAGE_STATE: Record<StageState, string> = { done: "مكتملة", current: "الآن", upcoming: "لاحقًا", not_included: "غير مشمولة" };

// Server action key → the section of this request that performs it.
export function umrahActionSection(key: string, requestId: string): string | null {
  switch (key) {
    case "COMPLETE_DOCUMENTS":
    case "REVIEW_DATA":
      return `documents-${requestId}`;
    case "PAY":
    case "REUPLOAD_RECEIPT":
      return `payment-${requestId}`;
    case "DOWNLOAD_VISAS":
    case "VIEW_FILES":
      return `umrah-pilgrims-${requestId}`;
    default:
      return null;
  }
}

const BADGE: Record<string, string> = {
  ISSUED: "bg-emerald-50 text-emerald-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  IN_PROGRESS: "bg-amber-50 text-amber-800",
  PREPARING: "bg-amber-50 text-amber-800",
  PENDING: "bg-muted text-muted-foreground",
  DELAYED: "bg-amber-50 text-amber-800",
  REJECTED: "bg-red-50 text-red-700",
};

function formatUpdated(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

function FileLinks({ requestId, files }: { requestId: string; files: JourneyFile[] }) {
  return (
    <>
      {files.map((file) => (
        <a
          key={file.id}
          href={`${API_URL}/tracking/requests/${requestId}/deliverables/${file.id}/file`}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-primary outline-none transition hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary"
          data-testid="umrah-file"
        >
          <Download className="size-4" aria-hidden />
          {file.label}
        </a>
      ))}
    </>
  );
}

export function UmrahJourneySection({ requestId, journey, onActionComplete }: { requestId: string; journey: UmrahJourney; onActionComplete?: () => void }) {
  const [bookingPending, setBookingPending] = React.useState(false);
  const [bookingMessage, setBookingMessage] = React.useState("");
  const [inquiryId, setInquiryId] = React.useState<string | null>(null);
  const bookingInFlight = React.useRef(false);
  const section = journey.primaryAction ? umrahActionSection(journey.primaryAction.key, requestId) : null;
  // Never a button whose action cannot be performed: shown only once the
  // section that performs it is on the page with content.
  // (Rendered hidden; revealed from the DOM after mount, no extra render.)
  const actionRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const target = section ? document.getElementById(section) : null;
    if (actionRef.current) actionRef.current.hidden = !(target && target.childElementCount > 0);
  }, [section, journey]);

  const now = journey.now;
  const anyFiles = journey.pilgrims.some((p) => p.visaFiles.length || p.serviceFiles?.length);
  const updated = formatUpdated(journey.updatedAt);

  function runAction() {
    const target = section ? document.getElementById(section) : null;
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  async function requestTickets() {
    if (bookingInFlight.current) return;
    bookingInFlight.current = true;
    setBookingPending(true);
    setBookingMessage("");
    try {
      const response = await fetch(`${API_URL}/tracking/requests/${requestId}/umrah/tickets`, {
        method: "POST", credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(20_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || "تعذّر إرسال طلب الحجز؛ حاول مجددًا.");
      setInquiryId(payload.data.inquiryId);
      onActionComplete?.();
    } catch (error) {
      setBookingMessage(error instanceof Error ? error.message : "تعذّر الاتصال؛ يمكنك إعادة المحاولة دون تكرار الطلب.");
    } finally {
      bookingInFlight.current = false;
      setBookingPending(false);
    }
  }

  return (
    <section className="mt-3 grid gap-4 rounded-2xl border border-border bg-background p-4" aria-labelledby={`umrah-title-${requestId}`} data-testid="umrah-journey">
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-[#d6aa4b]" aria-hidden>
          <Landmark className="size-5" />
        </span>
        <div>
          <h3 id={`umrah-title-${requestId}`} className="text-base font-bold text-primary">{journey.title}</h3>
          <p className="text-sm font-semibold text-[#b88a2a]" role="status" data-testid="umrah-status">{journey.status}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">رقم الطلب</dt><dd className="break-all font-mono text-xs font-bold" data-testid="umrah-reference">{journey.reference}</dd></div>
        <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">الباقة</dt><dd className="font-bold">{journey.packageLabel}</dd></div>
        <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">عدد المعتمرين</dt><dd className="font-bold">{journey.pilgrimCount}</dd></div>
        {updated ? <div className="rounded-lg bg-muted/60 p-2"><dt className="text-xs text-muted-foreground">آخر تحديث</dt><dd className="font-bold">{updated}</dd></div> : null}
      </dl>

      <ol className="grid" aria-label="مراحل رحلتك" data-testid="umrah-stages">
        {journey.stages.map((stage, index) => (
          <li
            key={stage.key}
            className={`relative flex items-start gap-3 pb-3 ${stage.state === "not_included" ? "opacity-60" : ""}`}
            aria-current={stage.state === "current" ? "step" : undefined}
            data-state={stage.state}
          >
            {index < journey.stages.length - 1 ? (
              <span aria-hidden className={`absolute top-6 bottom-0.5 w-0.5 start-[10px] ${stage.state === "done" ? "bg-[#d6aa4b]" : "bg-border"}`} />
            ) : null}
            <span
              aria-hidden
              className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${stage.state === "done" ? "border-[#d6aa4b] bg-[#d6aa4b] text-white" : stage.state === "current" ? "border-primary bg-background ring-4 ring-primary/10" : "border-border bg-background"}`}
            >
              {stage.state === "done" ? <Check className="size-3" /> : null}
            </span>
            <span className="grid gap-0.5">
              <b className={`text-sm ${stage.state === "current" ? "text-primary" : "text-foreground"}`}>{stage.label}</b>
              {stage.state === "current" && stage.status ? <small className="text-xs text-muted-foreground">{stage.status}</small> : null}
              {stage.state === "not_included" ? <small className="text-xs text-muted-foreground">غير مشمولة في باقتك</small> : null}
              <span className="sr-only"> — {STAGE_STATE[stage.state]}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className={`grid gap-2 rounded-xl border p-3 ${now.actionRequired ? "border-amber-300 bg-amber-50" : "border-border bg-card"}`} data-testid="umrah-now">
        <h4 className="text-sm font-bold text-primary">ماذا يحدث الآن؟</h4>
        {now.stepLabel ? <p className="text-sm"><span className="text-xs text-muted-foreground">المرحلة الحالية: </span><b>{now.stepLabel}</b></p> : null}
        <p className="text-sm leading-7" data-testid="umrah-now-message">{now.actionRequired ? now.message : now.noActionMessage || now.message}</p>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 text-xs">
          <div><dt className="text-muted-foreground">المسؤول</dt><dd className="font-bold">{ACTOR[now.actor] ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">هل يلزمك إجراء؟</dt><dd className="font-bold">{now.actionRequired ? "نعم" : "لا"}</dd></div>
          {now.nextStepLabel ? <div><dt className="text-muted-foreground">الخطوة التالية</dt><dd className="font-bold">{now.nextStepLabel}</dd></div> : null}
        </dl>
        {journey.primaryAction && section ? (
          <button
            ref={actionRef}
            hidden
            type="button"
            onClick={runAction}
            className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground outline-none transition hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-[#d6aa4b]"
            data-testid="umrah-action"
            data-action={journey.primaryAction.key}
          >
            {journey.primaryAction.label}
          </button>
        ) : null}
      </div>

      <div id={`umrah-pilgrims-${requestId}`} className="scroll-mt-24" data-testid="umrah-pilgrims">
        <h4 className="text-sm font-bold text-primary">المعتمرون{journey.servicesIncluded ? " والخدمات" : ""}</h4>
        <p className="mb-2 text-xs text-muted-foreground">
          صدرت {journey.visasIssued} من {journey.pilgrims.length} تأشيرات
          {journey.servicesIncluded ? ` — سُلّمت خدمات ${journey.servicesDelivered ?? 0} من ${journey.pilgrims.length}` : ""}
        </p>
        <ul className="grid gap-2">
          {journey.pilgrims.map((pilgrim) => (
            <li key={pilgrim.id} className="grid gap-2 rounded-lg border border-border p-3" data-testid="umrah-pilgrim">
              <div className="flex flex-wrap items-center gap-2">
                <b className="basis-full text-sm">{pilgrim.name}</b>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE[pilgrim.visa]}`} data-testid="umrah-visa-state">
                  <Stamp className="size-3.5" aria-hidden />
                  {VISA_STATE[pilgrim.visa]}
                </span>
                {pilgrim.services ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE[pilgrim.services]}`}>
                    <Package className="size-3.5" aria-hidden />
                    {SERVICE_STATE[pilgrim.services]}
                  </span>
                ) : null}
              </div>
              {pilgrim.visa === "DELAYED" || pilgrim.visa === "REJECTED" ? (
                <p className="text-sm" role="status" data-testid="umrah-visa-reason">
                  {pilgrim.visaReason ? <span>{pilgrim.visaReason}. </span> : null}
                  {pilgrim.visa === "DELAYED" && pilgrim.visaFollowUpAt ? <span>المتابعة القادمة: <bdi>{String(pilgrim.visaFollowUpAt).slice(0, 10)}</bdi>. </span> : null}
                  <span>ستتواصل معك الوكالة بالقرار؛ لا يُغلق الطلب قبل ذلك.</span>
                </p>
              ) : null}
              {pilgrim.visaFiles.length || pilgrim.serviceFiles?.length ? (
                <div className="flex flex-wrap gap-2">
                  <FileLinks requestId={requestId} files={pilgrim.visaFiles} />
                  <FileLinks requestId={requestId} files={pilgrim.serviceFiles ?? []} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {anyFiles ? null : <p className="mt-2 text-xs text-muted-foreground">تظهر هنا التأشيرات ومستندات الخدمات فور نشرها.</p>}
      </div>
      {journey.ticketBooking?.available || journey.ticketBooking?.inquiryId || inquiryId ? (
        <div className="mt-4 rounded-lg border border-border p-3" data-testid="umrah-ticket-booking">
          <h4 className="font-bold">حجز التذاكر بعد صدور التأشيرات</h4>
          <p className="my-2 text-sm text-muted-foreground">خدمة اختيارية؛ يؤكد موظف الوكالة السعر والتوفر قبل الحجز.</p>
          {journey.ticketBooking?.inquiryId || inquiryId ? (
            <p role="status">أُرسل طلب الحجز إلى الوكالة. رقم الطلب: <bdi>{journey.ticketBooking?.inquiryId || inquiryId}</bdi></p>
          ) : <button type="button" disabled={bookingPending} onClick={requestTickets} className="min-h-11 rounded-lg border border-border px-3 font-semibold text-primary disabled:opacity-50">{bookingPending ? "جارٍ إرسال الطلب…" : `طلب حجز تذاكر ${journey.ticketBooking?.mode === "SEA" ? "البحر" : "الطيران"} من الوكالة`}</button>}
          {bookingMessage ? <p role="alert" className="mt-2 text-sm text-destructive">{bookingMessage}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
