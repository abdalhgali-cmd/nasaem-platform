"use client";

import * as React from "react";
import { Check, CheckCircle2, Circle, CircleDot, Copy, Download, Loader2, LogOut, MessageCircle, PhoneCall, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { siteConfig } from "@/lib/site-config";
import { LegalDisclosure } from "@/components/legal-disclosure";

type TrackedRequestStatus = "NEW" | "CONTACTED" | "CLOSED";
type InvoiceStatus = "PENDING" | "APPROVED" | "REJECTED";
type PaymentStatus = "NOT_REQUIRED" | "AWAITING_TRANSFER" | "UNDER_REVIEW" | "CONFIRMED";

type TrackedInvoice = {
  amount: string;
  currency: string;
  description: string | null;
  status: InvoiceStatus;
};

type TrackedOffer = {
  id: string;
  carrier: string;
  description: string | null;
  amount: string;
  currency: string;
};

type DocumentStatus = "PENDING" | "ACCEPTED" | "REJECTED";

type TrackedDocument = {
  id: string;
  label: string;
  status: DocumentStatus;
  reviewNote: string | null;
};

type TrackedDeliverable = {
  id: string;
  label: string;
};

// Smart Case Operations — Release D (Customer Portal 2.0). Derived
// server-side from the request's own requirements snapshot and documents
// (see customer-checklist.js) so the portal and staff never disagree about
// what is outstanding. Both fields are absent on requests that carry no
// checklist at all (plain contact-form submissions), which every read
// below tolerates.
type ChecklistState = "MISSING" | "UNDER_REVIEW" | "REJECTED" | "ACCEPTED" | "ANSWERED";

type ChecklistItem = {
  requirementId: string;
  label: string;
  description: string | null;
  kind: "DOCUMENT" | "ANSWER";
  required: boolean;
  state: ChecklistState;
  documentId?: string | null;
  reviewNote?: string | null;
  travelerId?: string | null;
  travelerName?: string | null;
  answer?: string | null;
};

type NextAction = {
  code: string;
  requirementId?: string;
  label: string;
  reason: string | null;
};

// Release G — a document this customer already had accepted on an earlier
// request, offered so they aren't asked to photograph the same passport
// twice. The number is masked server-side; the file is never auto-attached.
type ReusableDocument = {
  id: string;
  label: string;
  fileName: string;
  travelerName: string | null;
  passportHint: string | null;
  expiresAt: string | null;
};

type ClosedOutcome = "COMPLETED" | "REJECTED" | "CANCELLED";

// Phase 1.5 — Service Intake context (Umrah/Visas/Packages). Only the
// human-readable fields the customer needs — never an internal id beyond
// what identifies *which* catalog entry (name/category/country), matching
// the "no unnecessary internal ids" rule for this panel.
type TrackedServiceRef = {
  name: string;
  category: string;
};

type TrackedVisaType = {
  name: string;
  country: string;
};

type TrackedTraveler = {
  fullName?: string;
  passportNo?: string;
  nationality?: string;
};

// Free-form by design (see schema.prisma's ContactRequest.intakeData
// comment) — every field is optional here too, and every read below
// tolerates it being entirely absent (plain contact-form submissions never
// set it) or partially filled.
type TrackedIntakeData = {
  travelers?: TrackedTraveler[];
  notes?: string;
} | null;

type TrackedRequest = {
  id: string;
  service: string | null;
  serviceRef: TrackedServiceRef | null;
  visaType: TrackedVisaType | null;
  travelerCount: number | null;
  intakeData: TrackedIntakeData;
  message: string;
  status: TrackedRequestStatus;
  statusLabel: string;
  createdAt: string;
  invoice: TrackedInvoice | null;
  offers: TrackedOffer[];
  selectedOfferId: string | null;
  paymentStatus: PaymentStatus;
  documents: TrackedDocument[];
  checklist?: ChecklistItem[];
  nextActions?: NextAction[];
  deliverables: TrackedDeliverable[];
  outcome: ClosedOutcome | null;
  outcomeNote: string | null;
};

const OUTCOME_BADGE_CLASS: Record<ClosedOutcome, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
  CANCELLED: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// A closed request's badge color should reflect how it ended, not always
// the generic "closed" green — a REJECTED/CANCELLED outcome reads as bad
// news and shouldn't look identical to a successfully COMPLETED one.
function requestBadgeClass(req: TrackedRequest) {
  if (req.status === "CLOSED" && req.outcome) {
    return OUTCOME_BADGE_CLASS[req.outcome];
  }
  return STATUS_BADGE_CLASS[req.status];
}

const DOCUMENT_BADGE_CLASS: Record<DocumentStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ACCEPTED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: "قيد المراجعة",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
};

type Stage = "checking" | "phone" | "code" | "requests" | "error";

const STATUS_BADGE_CLASS: Record<TrackedRequestStatus, string> = {
  NEW: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  CONTACTED: "bg-primary/10 text-primary dark:text-secondary",
  CLOSED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

function formatMoney(amount: string, currency: string) {
  return `${Number(amount).toLocaleString("en-US")} ${currency}`;
}

function getRequestNextAction(req: TrackedRequest) {
  if (req.status === "CLOSED") {
    return req.outcome === "COMPLETED"
      ? "لا يوجد إجراء مطلوب منك حاليًا. طلبك مكتمل."
      : "لا يوجد إجراء مطلوب منك حاليًا. يمكنك التواصل معنا إذا احتجت إلى مساعدة.";
  }
  if (req.deliverables.length > 0) return "ملفاتك النهائية جاهزة للتحميل.";
  if (req.documents.some((doc) => doc.status === "REJECTED")) {
    return "أعد رفع المستند المرفوض بعد مراجعة الملاحظة الموضحة أدناه.";
  }
  if (req.paymentStatus === "UNDER_REVIEW") return "انتظر مراجعة إثبات التحويل من فريقنا.";
  if (req.paymentStatus === "AWAITING_TRANSFER") return "حوّل المبلغ ثم اضغط «تم تحويل المبلغ».";
  if (req.invoice?.status === "PENDING") return "راجع السعر المقترح ثم اختر الموافقة أو الرفض.";
  if (req.offers.length > 0 && !req.selectedOfferId) return "راجع العروض واختر العرض المناسب لك.";
  if (req.documents.some((doc) => doc.status === "PENDING")) return "انتظر مراجعة المستندات المرفوعة.";
  return "لا يوجد إجراء مطلوب منك حاليًا. سنخبرك عند الحاجة.";
}

type TimelineStepState = "done" | "current" | "upcoming";
type TimelineStep = { label: string; state: TimelineStepState };

// Milestones are derived only from fields staff/the system have actually
// recorded (status, documents, offers, invoice, paymentStatus,
// deliverables) — never inferred or guessed, so this can never show a step
// as complete (e.g. a pricing or security approval) before that happens on
// the backend. Steps that don't apply to a given request (no offers, no
// invoice, no payment required) are omitted rather than shown as N/A.
function getRequestTimeline(req: TrackedRequest): TimelineStep[] {
  const steps: TimelineStep[] = [{ label: "تم استلام الطلب", state: "done" }];

  const reviewStarted = req.status !== "NEW";
  steps.push({ label: "قيد المراجعة من الفريق", state: reviewStarted ? "done" : "current" });

  if (req.documents.length > 0) {
    const hasUnresolved = req.documents.some((doc) => doc.status === "PENDING" || doc.status === "REJECTED");
    steps.push({
      label: "مراجعة المستندات",
      state: hasUnresolved ? (reviewStarted ? "current" : "upcoming") : "done",
    });
  }

  if (req.offers.length > 0) {
    steps.push({ label: "اختيار العرض المناسب", state: req.selectedOfferId ? "done" : "current" });
  }

  if (req.invoice) {
    steps.push({
      label: "اعتماد السعر",
      state: req.invoice.status === "APPROVED" ? "done" : req.invoice.status === "PENDING" ? "current" : "upcoming",
    });
  }

  if (req.paymentStatus !== "NOT_REQUIRED") {
    const paymentCurrent = req.paymentStatus === "AWAITING_TRANSFER" || req.paymentStatus === "UNDER_REVIEW";
    steps.push({
      label: "الدفع",
      state: req.paymentStatus === "CONFIRMED" ? "done" : paymentCurrent ? "current" : "upcoming",
    });
  }

  steps.push({ label: "استلام الوثيقة النهائية", state: req.deliverables.length > 0 ? "done" : "upcoming" });

  if (req.status === "CLOSED") {
    const closedLabel =
      req.outcome === "COMPLETED"
        ? "اكتمل الطلب"
        : req.outcome === "REJECTED"
          ? "تم رفض الطلب"
          : req.outcome === "CANCELLED"
            ? "تم إلغاء الطلب"
            : "تم إغلاق الطلب";
    steps.push({ label: closedLabel, state: "done" });
  }

  return steps;
}

const TIMELINE_STEP_ICON_CLASS: Record<TimelineStepState, string> = {
  done: "text-emerald-600 dark:text-emerald-400",
  current: "text-primary dark:text-secondary",
  upcoming: "text-muted-foreground/40",
};

function RequestTimeline({ req }: { req: TrackedRequest }) {
  const steps = getRequestTimeline(req);

  return (
    <ol className="mt-3 flex flex-col gap-0">
      {steps.map((step, index) => (
        <li key={step.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            {step.state === "done" ? (
              <CheckCircle2 className={`size-5 ${TIMELINE_STEP_ICON_CLASS.done}`} />
            ) : step.state === "current" ? (
              <CircleDot className={`size-5 ${TIMELINE_STEP_ICON_CLASS.current}`} />
            ) : (
              <Circle className={`size-5 ${TIMELINE_STEP_ICON_CLASS.upcoming}`} />
            )}
            {index < steps.length - 1 ? (
              <span
                className={`mt-0.5 h-6 w-px flex-1 ${step.state === "done" ? "bg-emerald-500/40" : "bg-border"}`}
              />
            ) : null}
          </div>
          <span
            className={`pb-4 text-xs font-semibold ${
              step.state === "upcoming" ? "text-muted-foreground/60" : "text-foreground"
            }`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Shared by every panel below that posts a tracking action (invoice
// approve/reject, offer selection, mark-transfer-sent) and needs the
// request list refreshed on success — same loading/error state, same
// fetch-and-refresh shape each time.
function useTrackingAction(onActionComplete: () => Promise<void>) {
  const [acting, setActing] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  async function postAction(path: string) {
    setActing(true);
    setActionError("");

    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "تعذّر تنفيذ العملية، حاول مرة أخرى");
      }

      await onActionComplete();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "تعذّر تنفيذ العملية، حاول مرة أخرى"
      );
    } finally {
      setActing(false);
    }
  }

  return { acting, actionError, postAction };
}

function RequestInvoicePanel({
  req,
  onActionComplete,
}: {
  req: TrackedRequest;
  onActionComplete: () => Promise<void>;
}) {
  const { acting, actionError, postAction } = useTrackingAction(onActionComplete);

  if (!req.invoice) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">السعر المقترح</span>
        <span className="text-base font-bold text-foreground" dir="ltr">
          {formatMoney(req.invoice.amount, req.invoice.currency)}
        </span>
      </div>
      {req.invoice.description ? (
        <p className="mt-1 text-xs text-muted-foreground">{req.invoice.description}</p>
      ) : null}

      {actionError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
      ) : null}

      {req.invoice.status === "PENDING" ? (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="gold"
            disabled={acting}
            onClick={() => postAction(`/tracking/requests/${req.id}/invoice/approve`)}
          >
            موافقة على السعر
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() => postAction(`/tracking/requests/${req.id}/invoice/reject`)}
          >
            رفض
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RequestOffersPanel({
  req,
  onActionComplete,
}: {
  req: TrackedRequest;
  onActionComplete: () => Promise<void>;
}) {
  const { acting, actionError, postAction } = useTrackingAction(onActionComplete);

  if (req.offers.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <span className="text-sm font-semibold text-foreground">عروض الأسعار</span>

      {actionError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
      ) : null}

      <ul className="mt-2 flex flex-col gap-2">
        {req.offers.map((offer) => {
          const isSelected = offer.id === req.selectedOfferId;
          return (
            <li
              key={offer.id}
              className={`rounded-lg border p-3 text-xs ${isSelected ? "border-accent bg-accent/5" : "border-border/70"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground">{offer.carrier}</span>
                <span className="font-bold text-foreground" dir="ltr">
                  {formatMoney(offer.amount, offer.currency)}
                </span>
              </div>
              {offer.description ? (
                <p className="mt-1 text-muted-foreground">{offer.description}</p>
              ) : null}

              {isSelected ? (
                <span className="mt-2 inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  تم الاختيار
                </span>
              ) : !req.selectedOfferId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={acting}
                  onClick={() => postAction(`/tracking/requests/${req.id}/offers/${offer.id}/select`)}
                >
                  اختيار هذا العرض
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Shown once per request, regardless of which pricing mechanism (Invoice or
// multi-carrier offers) got it to AWAITING_TRANSFER — both feed the same
// paymentStatus state machine from that point on.
function RequestTransferAction({
  req,
  onActionComplete,
}: {
  req: TrackedRequest;
  onActionComplete: () => Promise<void>;
}) {
  const { acting, actionError, postAction } = useTrackingAction(onActionComplete);

  if (req.paymentStatus !== "AWAITING_TRANSFER") {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <p className="text-xs text-muted-foreground">
        بعد تحويل المبلغ، اضغط الزر التالي لإعلام فريقنا بذلك.
      </p>
      {actionError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="gold"
        className="mt-2"
        disabled={acting}
        onClick={() => postAction(`/tracking/requests/${req.id}/mark-transfer-sent`)}
      >
        تم تحويل المبلغ
      </Button>
    </div>
  );
}

const CHECKLIST_BADGE_CLASS: Record<ChecklistState, string> = {
  MISSING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  UNDER_REVIEW: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
  ACCEPTED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ANSWERED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

const CHECKLIST_STATE_LABEL: Record<ChecklistState, string> = {
  MISSING: "مطلوب",
  UNDER_REVIEW: "قيد المراجعة",
  REJECTED: "يحتاج إعادة رفع",
  ACCEPTED: "مكتمل",
  ANSWERED: "مكتمل",
};

// Smart Case Operations — Release D. The action-first block: only things
// the customer can actually unblock, in the order the server ranked them.
// Anything waiting on staff is deliberately not listed here — it shows up
// in the checklist below as "قيد المراجعة" instead, so the customer is
// never asked to do work that isn't theirs.
function RequestActionPanel({ req }: { req: TrackedRequest }) {
  const actions = req.nextActions ?? [];

  // Requests that predate the checklist (and plain contact-form
  // submissions) carry no actions at all — they keep the original
  // single-line hint rather than rendering an empty box.
  if (actions.length === 0) {
    return (
      <div className="mt-1 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
        <span className="font-bold">الخطوة التالية</span>
        <p className="mt-1 text-muted-foreground">{getRequestNextAction(req)}</p>
      </div>
    );
  }

  return (
    <div className="mt-1 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
      <span className="font-bold">
        {actions.length === 1 ? "الخطوة التالية" : `الخطوات المطلوبة منك (${actions.length})`}
      </span>
      <ul className="mt-2 flex flex-col gap-2">
        {actions.map((action, index) => (
          <li key={`${action.code}-${action.requirementId ?? index}`} className="flex items-start gap-2">
            <CircleDot className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <p className="font-semibold text-foreground">{action.label}</p>
              {action.reason ? (
                <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{action.reason}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The full checklist for the request — including the rows that are already
// done and the ones sitting with us. Shown so the customer can see the
// whole picture, not just the outstanding slice in the action block.
function RequestChecklistPanel({ req }: { req: TrackedRequest }) {
  const checklist = req.checklist ?? [];
  if (checklist.length === 0) return null;

  const done = checklist.filter((item) => item.state === "ACCEPTED" || item.state === "ANSWERED").length;

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">قائمة المتطلبات</span>
        <span className="text-xs text-muted-foreground">
          {done} من {checklist.length} مكتمل
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {checklist.map((item) => (
          <li key={item.requirementId} className="rounded-lg border border-border/70 p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">
                {item.label}
                {item.travelerName ? (
                  <span className="font-normal text-muted-foreground"> — {item.travelerName}</span>
                ) : null}
                {!item.required ? (
                  <span className="font-normal text-muted-foreground"> (اختياري)</span>
                ) : null}
              </span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${CHECKLIST_BADGE_CLASS[item.state]}`}>
                {CHECKLIST_STATE_LABEL[item.state]}
              </span>
            </div>
            {item.description ? (
              <p className="mt-1 text-muted-foreground">{item.description}</p>
            ) : null}
            {item.state === "REJECTED" && item.reviewNote ? (
              <p className="mt-1 text-red-600 dark:text-red-400">{item.reviewNote}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestDocumentsPanel({
  req,
  onActionComplete,
}: {
  req: TrackedRequest;
  onActionComplete: () => Promise<void>;
}) {
  const [label, setLabel] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  // Release D — which checklist row this upload answers. "" means the
  // customer is uploading something outside the checklist and types their
  // own label, exactly as before this release.
  const [requirementId, setRequirementId] = React.useState("");
  // Release G — the customer's own previously-accepted documents. Fetched
  // lazily, and a failure is silent: reuse is a convenience, so it must
  // never block the ordinary upload path below.
  const [reusable, setReusable] = React.useState<ReusableDocument[]>([]);

  // Only rows the customer still has to act on can be tagged; an already
  // accepted requirement isn't offered, since re-uploading against it is
  // not what they came here to do.
  const outstanding = (req.checklist ?? []).filter(
    (item) => item.kind === "DOCUMENT" && (item.state === "MISSING" || item.state === "REJECTED")
  );

  React.useEffect(() => {
    if (outstanding.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/tracking/reusable-documents`, { credentials: "include" });
        if (!res.ok) return;
        const payload = await res.json().catch(() => null);
        if (!cancelled) setReusable(payload?.data ?? []);
      } catch {
        // Reuse is optional — staying quiet is the right failure here.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [outstanding.length]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      const selected = outstanding.find((item) => item.requirementId === requirementId);
      formData.append("label", selected ? selected.label : label);
      if (requirementId) formData.append("requirementId", requirementId);
      formData.append("file", file);

      const res = await fetch(`${API_URL}/tracking/requests/${req.id}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "تعذّر رفع الملف، حاول مرة أخرى");
      }

      setLabel("");
      setFile(null);
      setRequirementId("");
      e.currentTarget.reset();
      await onActionComplete();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "تعذّر رفع الملف، حاول مرة أخرى");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <span className="text-sm font-semibold text-foreground">المستندات</span>

      {req.documents.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {req.documents.map((doc) => (
            <li key={doc.id} className="rounded-lg border border-border/70 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{doc.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${DOCUMENT_BADGE_CLASS[doc.status]}`}
                >
                  {DOCUMENT_STATUS_LABEL[doc.status]}
                </span>
              </div>
              {doc.status === "REJECTED" && doc.reviewNote ? (
                <p className="mt-1 text-red-600 dark:text-red-400">{doc.reviewNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">لم يتم رفع أي مستندات بعد.</p>
      )}

      <div className="mt-3">
        <LegalDisclosure sensitive />
      </div>

      {reusable.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs">
          <p className="font-semibold text-foreground">مستندات سبق قبولها لك</p>
          <p className="mt-1 text-muted-foreground">
            يمكنك ذكر أحدها لموظف خدمة العملاء بدل تصوير المستند من جديد.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {reusable.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-foreground">{doc.label}</span>
                {doc.travelerName ? <span>— {doc.travelerName}</span> : null}
                {doc.passportHint ? <span dir="ltr">{doc.passportHint}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleUpload} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-semibold text-foreground">نوع المستند</label>
          {outstanding.length > 0 ? (
            <select
              value={requirementId}
              onChange={(e) => setRequirementId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none transition focus:border-primary"
            >
              <option value="">مستند آخر…</option>
              {outstanding.map((item) => (
                <option key={item.requirementId} value={item.requirementId}>
                  {item.label}
                  {item.state === "REJECTED" ? " (إعادة رفع)" : ""}
                </option>
              ))}
            </select>
          ) : null}
          {/* Tagging the upload against a checklist row is what lets staff
              see the requirement satisfied instead of an untitled file; a
              customer with something outside the checklist can still name
              it themselves. */}
          {requirementId === "" ? (
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: جواز السفر"
              className="h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none transition focus:border-primary"
            />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-semibold text-foreground">الملف</label>
          <input
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-muted-foreground file:me-2 file:rounded-md file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={uploading}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : null}
          رفع
        </Button>
      </form>
      {uploadError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
      ) : null}
    </div>
  );
}

// Phase 1.5 — the structured Service Intake data the customer submitted
// through the wizard (visa type, traveler count, traveler list, notes).
// Deliberately never renders intakeData as raw JSON — broken into the same
// labeled sections a person filled in on the wizard, and silently omits any
// piece that's missing rather than showing an empty/broken section (plain
// contact-form requests have none of this and render nothing here at all).
function RequestIntakeSummaryPanel({ req }: { req: TrackedRequest }) {
  const travelers = (req.intakeData?.travelers ?? []).filter(
    (t) => t.fullName && t.fullName.trim().length > 0
  );
  const notes = req.intakeData?.notes?.trim();
  const hasTravelerCount = typeof req.travelerCount === "number" && req.travelerCount > 0;

  if (!req.visaType && !hasTravelerCount && travelers.length === 0 && !notes) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <span className="text-sm font-semibold text-foreground">تفاصيل الطلب</span>
      <div className="mt-2 flex flex-col gap-3 text-xs text-muted-foreground">
        {req.visaType ? (
          <span>
            نوع التأشيرة: <span className="font-semibold text-foreground">{req.visaType.name}</span>
            {" "}({req.visaType.country})
          </span>
        ) : null}

        {hasTravelerCount ? <span>عدد المسافرين: {req.travelerCount}</span> : null}

        {travelers.length > 0 ? (
          <div>
            <span className="font-semibold text-foreground">بيانات المسافرين</span>
            <ul className="mt-1 flex flex-col gap-1">
              {travelers.map((traveler, index) => (
                <li key={index}>
                  {traveler.fullName}
                  {traveler.passportNo ? ` — جواز: ${traveler.passportNo}` : ""}
                  {traveler.nationality ? ` — ${traveler.nationality}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notes ? (
          <div>
            <span className="font-semibold text-foreground">ملاحظات</span>
            <p className="mt-1">{notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Read-only, unlike every other panel here — nothing for the customer to
// approve/reject/upload, just files staff delivered that are theirs to
// download. A plain same-site link (not a fetch+blob dance) is enough: the
// tracking cookie is SameSite=Lax, which browsers still send on a direct
// top-level navigation like opening this link in a new tab, exactly like
// the staff dashboard already does for its own document links.
function RequestReference({ requestId }: { requestId: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copyReference() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">رقم الطلب</span>
      <div className="flex items-center gap-2" dir="ltr">
        <span className="max-w-[12rem] truncate font-mono text-xs font-bold text-foreground">{requestId}</span>
        <button
          type="button"
          onClick={copyReference}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="نسخ رقم الطلب"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          <span aria-live="polite">{copied ? "تم النسخ" : "نسخ"}</span>
        </button>
      </div>
    </div>
  );
}

function RequestDeliverablesPanel({ req }: { req: TrackedRequest }) {
  if (req.deliverables.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <span className="text-sm font-semibold text-foreground">ملفاتك النهائية جاهزة</span>
      <ul className="mt-2 flex flex-col gap-2">
        {req.deliverables.map((deliverable) => (
          <li key={deliverable.id}>
            <a
              href={`${API_URL}/tracking/requests/${req.id}/deliverables/${deliverable.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <Download className="size-4" />
              {deliverable.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// en-GB gives the same DD/MM/YYYY Gregorian shape as the staff dashboard's
// ar-SA-u-ca-gregory-nu-latn (frontend/assets/api.js's formatDate) without
// that locale's embedded bidi control characters, which visually reorder
// the digits when rendered inside this page's RTL Arabic layout even under
// an explicit dir="ltr" on the containing element.
function formatTrackedDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function TrackingPanel() {
  const [stage, setStage] = React.useState<Stage>("checking");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [requests, setRequests] = React.useState<TrackedRequest[]>([]);

  const loadRequests = React.useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API_URL}/tracking/requests`, {
        credentials: "include",
        signal: controller.signal,
      });

      if (!res.ok) {
        return { loggedIn: false as const, error: null };
      }

      const payload = await res.json().catch(() => null);
      return { loggedIn: true as const, requests: payload?.data ?? [], error: null };
    } catch {
      return { loggedIn: false as const, error: "تعذر الاتصال بخدمة التتبع. حاول مرة أخرى." };
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const refreshRequests = React.useCallback(async () => {
    const result = await loadRequests();
    if (result.loggedIn) {
      setRequests(result.requests);
    }
  }, [loadRequests]);

  // Checks for an existing tracking session on mount (a real "synchronize
  // with an external system" effect). Guarded with `ignore` per React's own
  // data-fetching-in-effects guidance so a stale response from a fast
  // unmount/remount can never clobber newer state.
  React.useEffect(() => {
    let ignore = false;

    loadRequests().then((result) => {
      if (ignore) return;

      if (result.error) {
        setError(result.error);
        setStage("error");
      } else if (result.loggedIn) {
        setRequests(result.requests);
        setStage("requests");
      } else {
        setStage("phone");
      }
    });

    return () => {
      ignore = true;
    };
  }, [loadRequests]);

  async function handleRequestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setInfo("");

    try {
      const res = await fetch(`${API_URL}/tracking/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "تعذّر إرسال رمز التحقق، حاول مرة أخرى");
      }

      setInfo(payload?.message || "تم إرسال رمز التحقق عبر واتساب");
      setStage("code");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذّر إرسال رمز التحقق، حاول مرة أخرى"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/tracking/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, code }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "رمز التحقق غير صحيح");
      }

      setCode("");
      const result = await loadRequests();
      if (result.loggedIn) {
        setRequests(result.requests);
        setStage("requests");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "رمز التحقق غير صحيح");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch(`${API_URL}/tracking/logout`, {
      method: "POST",
      credentials: "include",
    });
    setPhone("");
    setCode("");
    setRequests([]);
    setError("");
    setInfo("");
    setStage("phone");
  }

  if (stage === "checking") {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error || "تعذر تحميل التتبع."}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (stage === "requests") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">طلباتك</h2>
          <Button variant="outline" size="sm" onClick={handleLogout} type="button">
            <LogOut className="size-4" />
            تسجيل الخروج
          </Button>
        </div>

        {requests.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد طلبات مرتبطة بهذا الرقم بعد.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {requests.map((req) => (
              <li
                key={req.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">
                    {req.service || "استفسار عام"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${requestBadgeClass(req)}`}
                  >
                    {req.statusLabel}
                  </span>
                </div>
                <RequestReference requestId={req.id} />
                <RequestTimeline req={req} />
                <RequestActionPanel req={req} />
                <p className="mt-2 text-sm text-muted-foreground">{req.message}</p>
                {req.status === "CLOSED" && req.outcomeNote ? (
                  <p className="mt-1 text-sm text-muted-foreground">{req.outcomeNote}</p>
                ) : null}
                <RequestIntakeSummaryPanel req={req} />
                <RequestDeliverablesPanel req={req} />
                <RequestInvoicePanel req={req} onActionComplete={refreshRequests} />
                <RequestOffersPanel req={req} onActionComplete={refreshRequests} />
                <RequestTransferAction req={req} onActionComplete={refreshRequests} />
                <RequestChecklistPanel req={req} />
                <RequestDocumentsPanel req={req} onActionComplete={refreshRequests} />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {formatTrackedDate(req.createdAt)}
                  </p>
                  <a
                    href={`https://wa.me/${siteConfig.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground outline-none transition hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <MessageCircle className="size-4" />
                    تحتاج مساعدة؟ تواصل معنا عبر واتساب
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
      {error ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}
      {info && stage === "code" ? (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          {info}
        </div>
      ) : null}

      {stage === "phone" ? (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
              <PhoneCall className="size-6" />
            </span>
            <h2 className="text-lg font-bold text-foreground">تتبع طلبك</h2>
            <p className="text-sm text-muted-foreground">
              أدخل رقم الهاتف الذي استخدمته عند التواصل معنا، وسنرسل لك رمز تحقق
              عبر واتساب.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-semibold text-foreground">
              رقم الهاتف
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-4 text-end text-sm outline-none transition focus:border-primary"
              placeholder="+249 9XX XXX XXX"
            />
          </div>
          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {submitting ? "جارٍ الإرسال..." : "إرسال رمز التحقق"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
              <ShieldCheck className="size-6" />
            </span>
            <h2 className="text-lg font-bold text-foreground">أدخل رمز التحقق</h2>
            <p className="text-sm text-muted-foreground">
              أرسلنا رمزًا مكوّنًا من 6 أرقام عبر واتساب إلى الرقم الذي أدخلته.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-sm font-semibold text-foreground">
              رمز التحقق
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-12 rounded-xl border border-border bg-background px-4 text-center text-lg font-bold tracking-[0.5em] outline-none transition focus:border-primary"
              placeholder="000000"
            />
          </div>
          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {submitting ? "جارٍ التحقق..." : "تأكيد"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStage("phone");
              setCode("");
              setError("");
              setInfo("");
            }}
            className="text-center text-sm font-semibold text-primary hover:underline"
          >
            تغيير رقم الهاتف
          </button>
        </form>
      )}
    </div>
  );
}
