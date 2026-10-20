"use client";

import * as React from "react";
import { Check, CheckCircle2, Download, Eye, FileText, Loader2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { customerErrorMessage } from "@/lib/network-error";

// Egypt security approval on /track: the server's stage timeline, the typed
// files (paid receipt, approval, circular, tickets) with preview and
// download, the travel preparation still needed from the customer, and the
// flight question. Everything comes from the server's `egypt` overview
// (backend egypt-approval-rules.js egyptOverview) — only current published
// files are listed there; nothing is inferred here. Mirrors the app's
// egypt-journey.js.

type StepState = "done" | "current" | "upcoming";

export type EgyptFileRef = {
  id: string;
  label: string;
  fileName?: string | null;
  mimeType?: string | null;
  version?: number;
  publishedAt?: string | null;
  /** The issue date written on the document (date only); newer servers. */
  issuedOn?: string | null;
  supersededAt?: string | null;
};

export type EgyptTicket = {
  source: "CUSTOMER" | "STAFF" | "LINKED_BOOKING";
  deliverableId?: string;
  documentId?: string;
  requestId?: string;
  label: string;
  status?: string;
  supersededAt?: string | null;
};

export type FlightChoice = "REQUEST" | "BOOKED" | "LATER";

export type FlightDetails = {
  flightNumber?: string | null;
  airline?: string | null;
  departureTime?: string | null;
  arrivalTime?: string | null;
  verified?: boolean;
};

export type EgyptOverview = {
  entryMode: "AIR" | "BORDER" | null;
  route?: { entryPort?: string | null } | null;
  approval: { issued: boolean; issuedOn: string | null; files: EgyptFileRef[] };
  circular: { status: "ISSUED" | "PROCESSING" | "NOT_STARTED"; issuedOn?: string | null; files: EgyptFileRef[] };
  tickets: EgyptTicket[];
  travel: { travelDate: string | null; preparationComplete: boolean; missing: { code: string; message: string }[]; customerCanEdit: boolean };
  flight: { choice: FlightChoice | null; details?: FlightDetails | null };
  receipt: { available: boolean; receiptNo: string | null; status: string | null };
  timeline: { key: string; label: string; state: StepState }[];
};

const STAGE_DETAIL: Record<string, string> = {
  PAYMENT_CONFIRMED: "نراجع تحويلك ونؤكده.",
  APPROVAL_IN_PROGRESS: "تعمل الوكالة على إصدار الموافقة.",
  CIRCULAR_ISSUED: "تجهّز الوكالة التعميم.",
};

const FLIGHT_TEXT: Record<FlightChoice, string> = {
  REQUEST: "طلبت حجز التذكرة عبر نسائم — ستتواصل معك الوكالة بالسعر.",
  BOOKED: "ذكرت أنك حجزت التذكرة بنفسك.",
  LATER: "ستقرر لاحقًا.",
};

type EgyptFile = {
  key: string;
  kind: "RECEIPT" | "APPROVAL" | "CIRCULAR" | "TICKET";
  title: string;
  label: string;
  url: string;
  fileName: string;
  mimeType: string | null;
  date: string | null;
  dateLabel: string;
  previewable: boolean;
};

function dateOnly(value: string | null | undefined) {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : null;
}

// Every file the customer can open, each on its own. Superseded files are
// never listed (the server sends current ones only; checked again here).
export function egyptFiles(requestId: string, egypt: EgyptOverview): EgyptFile[] {
  const files: EgyptFile[] = [];
  const deliverableUrl = (ownerId: string, id: string) => `${API_URL}/tracking/requests/${encodeURIComponent(ownerId)}/deliverables/${encodeURIComponent(id)}/file`;
  if (egypt.receipt?.available) {
    files.push({
      key: "receipt",
      kind: "RECEIPT",
      title: "إيصال السداد",
      label: egypt.receipt.receiptNo ? `رقم ${egypt.receipt.receiptNo}` : "إيصال السداد",
      url: `${API_URL}/tracking/requests/${encodeURIComponent(requestId)}/payment-receipt/file`,
      fileName: `${egypt.receipt.receiptNo || "receipt"}.pdf`,
      mimeType: "application/pdf",
      date: null,
      dateLabel: "",
      previewable: false,
    });
  }
  for (const file of (egypt.approval?.files ?? []).filter((f) => !f.supersededAt)) {
    files.push({
      key: `approval-${file.id}`,
      kind: "APPROVAL",
      title: "الموافقة الأمنية",
      label: file.label,
      url: deliverableUrl(requestId, file.id),
      fileName: file.fileName || `${file.label}`,
      mimeType: file.mimeType ?? null,
      date: file.issuedOn || egypt.approval.issuedOn || dateOnly(file.publishedAt),
      dateLabel: file.issuedOn || egypt.approval.issuedOn ? "تاريخ الإصدار" : "تاريخ النشر",
      previewable: true,
    });
  }
  for (const file of (egypt.circular?.files ?? []).filter((f) => !f.supersededAt)) {
    files.push({
      key: `circular-${file.id}`,
      kind: "CIRCULAR",
      title: "التعميم",
      label: file.label,
      url: deliverableUrl(requestId, file.id),
      fileName: file.fileName || `${file.label}`,
      mimeType: file.mimeType ?? null,
      date: file.issuedOn || egypt.circular.issuedOn || dateOnly(file.publishedAt),
      dateLabel: file.issuedOn || egypt.circular.issuedOn ? "تاريخ الإصدار" : "تاريخ النشر",
      previewable: true,
    });
  }
  for (const ticket of egypt.tickets ?? []) {
    // The customer's own upload is theirs already; superseded files never show.
    if (ticket.source === "CUSTOMER" || !ticket.deliverableId || ticket.supersededAt) continue;
    files.push({
      key: `ticket-${ticket.deliverableId}`,
      kind: "TICKET",
      title: "تذكرة الطيران",
      label: ticket.label,
      url: deliverableUrl(ticket.requestId || requestId, ticket.deliverableId),
      fileName: ticket.label,
      mimeType: null,
      date: null,
      dateLabel: "",
      previewable: true,
    });
  }
  return files;
}

// The ids of the deliverables shown here, so the generic list does not repeat them.
export function egyptDeliverableIds(egypt: EgyptOverview | null | undefined) {
  if (!egypt) return new Set<string>();
  return new Set<string>([
    ...(egypt.approval?.files ?? []).map((f) => f.id),
    ...(egypt.circular?.files ?? []).map((f) => f.id),
    ...(egypt.tickets ?? []).map((t) => t.deliverableId).filter((id): id is string => Boolean(id)),
  ]);
}

// "2026-11-02T08:30" (or a full ISO time) → "2026-11-02 08:30", as entered.
function formatFlightTime(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
}

function flightDetailsRows(details: FlightDetails | null | undefined): [string, string][] {
  if (!details) return [];
  const rows: [string, string][] = [];
  if (details.airline) rows.push(["شركة الطيران", details.airline]);
  if (details.flightNumber) rows.push(["رقم الرحلة", details.flightNumber]);
  if (details.departureTime) rows.push(["موعد الإقلاع", formatFlightTime(details.departureTime)]);
  if (details.arrivalTime) rows.push(["موعد الوصول", formatFlightTime(details.arrivalTime)]);
  return rows;
}

async function fetchFile(url: string) {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("تعذّر فتح الملف، حاول مرة أخرى");
  return res.blob();
}

function EgyptFileRow({ file }: { file: EgyptFile }) {
  const [busy, setBusy] = React.useState<"" | "preview" | "download">("");
  const [error, setError] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const imageRef = React.useRef<string | null>(null);

  React.useEffect(
    () => () => {
      if (imageRef.current) URL.revokeObjectURL(imageRef.current);
    },
    [],
  );

  async function preview() {
    if (busy) return;
    setError("");
    if (imageUrl) {
      // Second tap hides the inline preview.
      URL.revokeObjectURL(imageUrl);
      imageRef.current = null;
      setImageUrl(null);
      return;
    }
    // A PDF (or anything not an image) opens in a new tab, served inline by
    // the ownership-checked /file route with the tracking session cookie.
    if (!file.mimeType?.startsWith("image/")) {
      window.open(file.url, "_blank", "noopener,noreferrer");
      return;
    }
    setBusy("preview");
    try {
      const blob = await fetchFile(file.url);
      const url = URL.createObjectURL(blob);
      imageRef.current = url;
      setImageUrl(url);
    } catch (err) {
      setError(customerErrorMessage(err, "تعذّر فتح الملف، حاول مرة أخرى"));
    } finally {
      setBusy("");
    }
  }

  async function download() {
    if (busy) return;
    setError("");
    setBusy("download");
    try {
      const blob = await fetchFile(file.url);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(customerErrorMessage(err, "تعذّر تحميل الملف، حاول مرة أخرى"));
    } finally {
      setBusy("");
    }
  }

  return (
    <li className="rounded-xl border border-border bg-background p-3" data-testid="egypt-file" data-kind={file.kind}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex min-w-0 items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground">{file.title}</span>
            <span className="block break-words text-xs text-muted-foreground">{file.label}</span>
            {file.date ? (
              <span className="block text-xs text-muted-foreground" data-testid="egypt-file-date">
                {file.dateLabel}: <bdi dir="ltr">{file.date}</bdi>
              </span>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          {file.previewable ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => void preview()} disabled={Boolean(busy)} aria-label={`معاينة ${file.title}`} aria-expanded={file.mimeType?.startsWith("image/") ? Boolean(imageUrl) : undefined}>
              {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              <span className="text-xs">{imageUrl ? "إخفاء" : "معاينة"}</span>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => void download()} disabled={Boolean(busy)} aria-label={`تحميل ${file.title}`}>
            {busy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="text-xs">تحميل</span>
          </Button>
        </span>
      </div>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL of a private file.
        <img src={imageUrl} alt={`معاينة ${file.title}`} className="mt-3 max-h-96 w-full rounded-lg border border-border object-contain" data-testid="egypt-file-preview" />
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
    </li>
  );
}

export function EgyptJourneySection({
  requestId,
  egypt,
  closed,
  canChooseFlight,
  onActionComplete,
}: {
  requestId: string;
  egypt: EgyptOverview;
  closed: boolean;
  /** The server offers the flight question (allowedActions REQUEST_FLIGHT_BOOKING). */
  canChooseFlight: boolean;
  onActionComplete: () => Promise<void>;
}) {
  const [choosing, setChoosing] = React.useState<FlightChoice | null>(null);
  const [flightError, setFlightError] = React.useState("");
  const [flightSaved, setFlightSaved] = React.useState("");
  const files = egyptFiles(requestId, egypt);
  const todo = egypt.approval?.issued && !egypt.travel?.preparationComplete ? (egypt.travel?.missing ?? []).map((item) => item.message) : [];
  const air = egypt.entryMode === "AIR";

  async function chooseFlight(choice: FlightChoice) {
    if (choosing) return;
    setChoosing(choice);
    setFlightError("");
    setFlightSaved("");
    try {
      const res = await fetch(`${API_URL}/tracking/requests/${encodeURIComponent(requestId)}/egypt/flight`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || payload?.success === false) throw new Error(payload?.message || "تعذّر حفظ اختيارك، حاول مرة أخرى");
      setFlightSaved(choice === "REQUEST" ? "أُرسل طلب حجز التذكرة إلى الوكالة." : "تم حفظ اختيارك.");
      await onActionComplete();
    } catch (err) {
      setFlightError(customerErrorMessage(err, "تعذّر حفظ اختيارك، حاول مرة أخرى"));
    } finally {
      setChoosing(null);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 min-[400px]:p-4" data-testid="egypt-journey" aria-labelledby={`egypt-journey-${requestId}`}>
      <h3 id={`egypt-journey-${requestId}`} className="text-sm font-bold text-foreground">مراحل الموافقة الأمنية لمصر</h3>

      <ol className="mt-3 flex flex-col gap-2" data-testid="egypt-timeline">
        {egypt.timeline.map((step, index) => {
          const current = step.state === "current";
          let detail = "";
          if (current && !closed) {
            if (step.key === "TRAVEL_PREPARATION") detail = todo.length ? `مطلوب منك: ${todo.join(" ")}` : "";
            // CIRCULAR_IN_PROGRESS from current servers; CIRCULAR_ISSUED from older ones.
            else if (step.key === "CIRCULAR_IN_PROGRESS" || step.key === "CIRCULAR_ISSUED") detail = egypt.circular?.status === "PROCESSING" ? STAGE_DETAIL.CIRCULAR_ISSUED : "يُجهَّز التعميم بعد اكتمال بيانات السفر.";
            else detail = STAGE_DETAIL[step.key] || "";
          }
          return (
            <li
              key={step.key}
              data-step={step.key}
              data-state={step.state}
              aria-current={current ? "step" : undefined}
              className={`flex items-start gap-3 rounded-lg p-2 ${current ? "bg-background ring-2 ring-primary" : ""}`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  step.state === "done"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : current
                      ? "border-primary bg-primary/10 text-primary dark:border-secondary dark:text-secondary"
                      : "border-border bg-background text-muted-foreground"
                }`}
                aria-hidden="true"
              >
                {step.state === "done" ? <Check className="size-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${step.state === "upcoming" ? "text-muted-foreground" : "font-semibold text-foreground"}`}>{step.label}</span>
                <span className="sr-only"> — {step.state === "done" ? "مكتملة" : current ? "المرحلة الحالية" : "لم تبدأ بعد"}</span>
                {detail ? <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {egypt.approval?.issued ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400" data-testid="egypt-approval-issued">
          <CheckCircle2 className="size-4" /> تم إصدار الموافقة الأمنية
          {egypt.approval.issuedOn ? <bdi dir="ltr" className="text-xs font-normal">{egypt.approval.issuedOn}</bdi> : null}
        </p>
      ) : null}
      {egypt.circular?.status === "ISSUED" ? (
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> تم إصدار التعميم
          {egypt.circular.issuedOn ? <bdi dir="ltr" className="text-xs font-normal">{egypt.circular.issuedOn}</bdi> : null}
        </p>
      ) : null}
      {egypt.receipt?.status && !egypt.receipt.available ? <p className="mt-1 text-xs text-muted-foreground">إيصال السداد قيد الإنشاء.</p> : null}

      {files.length ? (
        <div className="mt-3">
          <h4 className="text-sm font-bold text-foreground">ملفاتك</h4>
          <ul className="mt-2 flex flex-col gap-2" data-testid="egypt-files">
            {files.map((file) => (
              <EgyptFileRow key={file.key} file={file} />
            ))}
          </ul>
        </div>
      ) : null}

      {egypt.approval?.issued && !closed ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm" data-testid="egypt-prep">
          <h4 className="font-bold text-foreground">تجهيز السفر والتعميم</h4>
          <p className="mt-1 text-xs text-muted-foreground">الموافقة الأمنية صادرة؛ هذه الخطوة لتجهيز التعميم قبل سفرك.</p>
          <p className="mt-2 text-xs">
            {egypt.entryMode === "BORDER" ? "تاريخ الوصول إلى المنفذ" : "تاريخ السفر"}:{" "}
            {egypt.travel?.travelDate ? <b dir="ltr">{egypt.travel.travelDate}</b> : <span className="text-muted-foreground">لم يُحدَّد بعد</span>}
          </p>
          {egypt.entryMode === "BORDER" && egypt.route?.entryPort ? <p className="mt-1 text-xs">منفذ الدخول: <b>{egypt.route.entryPort}</b></p> : null}
          {todo.length ? (
            <div className="mt-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300" role="status">
              <b>مطلوب منك</b>
              <ul className="mt-1 list-inside list-disc">
                {todo.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-1">أرسل هذه البيانات للوكالة عبر واتساب أو من تطبيق نسائم.</p>
            </div>
          ) : (
            <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">بيانات السفر مكتملة؛ تجهّز الوكالة التعميم.</p>
          )}

          {air ? (
            <div className="mt-3 border-t border-border pt-3" data-testid="egypt-flight">
              <p className="flex items-center gap-2 font-bold text-foreground">
                <Plane className="size-4 text-primary" /> هل ترغب في حجز تذكرة الطيران عبر نسائم الحرمين؟
              </p>
              {egypt.flight?.choice ? (
                <p className="mt-1 text-xs text-muted-foreground" data-testid="egypt-flight-choice">{FLIGHT_TEXT[egypt.flight.choice]}</p>
              ) : null}
              {flightDetailsRows(egypt.flight?.details).length ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/40 p-2 text-xs" data-testid="egypt-flight-details">
                  {flightDetailsRows(egypt.flight?.details).map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-semibold text-foreground" dir="auto">{value}</dd>
                    </React.Fragment>
                  ))}
                  <dt className="text-muted-foreground">الحالة</dt>
                  <dd className="text-foreground">{egypt.flight?.details?.verified ? "تحققت منها الوكالة" : "بانتظار تحقق الوكالة"}</dd>
                </dl>
              ) : null}
              {canChooseFlight ? (
                <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-3" role="group" aria-label="اختيار حجز تذكرة الطيران">
                  {(
                    [
                      ["REQUEST", "احجزوا لي عبر نسائم"],
                      ["BOOKED", "لدي تذكرة بالفعل"],
                      ["LATER", "لاحقًا"],
                    ] as const
                  ).map(([choice, label]) => (
                    <Button
                      key={choice}
                      type="button"
                      size="sm"
                      variant={choice === "REQUEST" ? "gold" : "outline"}
                      aria-pressed={egypt.flight?.choice === choice}
                      disabled={Boolean(choosing)}
                      onClick={() => void chooseFlight(choice)}
                      data-flight-choice={choice}
                    >
                      {choosing === choice ? <Loader2 className="size-4 animate-spin" /> : null}
                      {label}
                    </Button>
                  ))}
                </div>
              ) : null}
              {flightSaved ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400" role="status">{flightSaved}</p> : null}
              {flightError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{flightError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
