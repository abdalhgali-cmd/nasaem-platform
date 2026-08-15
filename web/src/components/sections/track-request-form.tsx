"use client";

import * as React from "react";
import { Loader2, MessageCircle, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Step = "phone" | "code" | "list";

type TrackedRequest = {
  id: string;
  referenceNumber: string | null;
  service: string | null;
  createdAt: string;
  currency: string | null;
  paymentAmount: string | null;
  executionStage: string | null;
  friendlyStatus: {
    label: string;
    needsDocuments: boolean;
    needsPayment: boolean;
    needsInvoiceApproval: boolean;
    needsOfferApproval: boolean;
    needsReupload: boolean;
    inExecution: boolean;
    executionStageLabel: string | null;
    outcome: "SUCCESS" | "CANCELLED" | null;
  };
  pendingInvoice: { invoiceNumber: string; currency: string; amount: string } | null;
  pendingOffers: {
    id: string;
    currency: string;
    amount: string;
    notes: string | null;
    legs: {
      id: string;
      direction: "OUTBOUND" | "RETURN";
      tripNumber: string | null;
      departureAt: string | null;
      arrivalAt: string | null;
      fromLocation: string;
      toLocation: string;
      carrier: { name: string; mode: "AIR" | "SEA" };
    }[];
  }[];
  documents: { id: string; type: string; status: string; rejectionReason: string | null; createdAt: string }[];
};

const TRIP_LEG_DIRECTION_LABELS: Record<string, string> = { OUTBOUND: "ذهاب", RETURN: "عودة" };

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary";

const CURRENCY_LABELS: Record<string, string> = { SAR: "ريال سعودي", SDG: "جنيه سوداني", USD: "دولار أمريكي" };

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PASSPORT: "صورة جواز السفر",
  GUARANTOR_ID: "صورة إقامة الضامن",
  ADDITIONAL: "المستند الإضافي",
};

// Endpoint each document type re-uploads through — same upload routes the
// initial submission uses (see visa-request-form.tsx's uploadFiles pattern).
const DOCUMENT_UPLOAD_ENDPOINTS: Record<string, string> = {
  PASSPORT: "passport-image",
  GUARANTOR_ID: "guarantor-id-image",
  ADDITIONAL: "additional-documents",
};

// Mirrors the backend's per-row "needs re-upload" check (see
// deriveCustomerFacingStatus): a REJECTED document still needs action
// unless a later document of the same type exists. Approximated with
// createdAt only (the customer-facing /mine response doesn't expose
// updatedAt) — close enough for deciding which rejected items to still list.
function getDocumentsNeedingReupload(documents: TrackedRequest["documents"]) {
  return documents.filter(
    (d) =>
      d.status === "REJECTED" &&
      !documents.some((other) => other.type === d.type && new Date(other.createdAt) > new Date(d.createdAt))
  );
}

export function TrackRequestForm() {
  const [step, setStep] = React.useState<Step>("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [loginCodeId, setLoginCodeId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [resendCooldown, setResendCooldown] = React.useState(0);
  const [requests, setRequests] = React.useState<TrackedRequest[] | null>(null);

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function fetchMyRequests() {
    const res = await fetch(`${API_URL}/contact-requests/mine`, { credentials: "include" });
    const payload = await res.json().catch(() => null);
    if (res.ok) setRequests(payload?.data ?? []);
  }

  async function requestCode() {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/customer-auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "تعذّر إرسال الرمز، حاول مرة أخرى");
      }

      setLoginCodeId(payload.data.loginCodeId);
      setResendCooldown(60);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الرمز، حاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRequestCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestCode();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/customer-auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loginCodeId, code }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "رمز غير صحيح أو منتهي الصلاحية");
      }

      await fetchMyRequests();
      setStep("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "رمز غير صحيح أو منتهي الصلاحية");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={handleRequestCodeSubmit} className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
        <h3 className="text-lg font-bold text-foreground">أدخل رقم هاتفك</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          سنرسل لك رمز دخول عبر واتساب على نفس الرقم الذي استخدمته عند تقديم طلبك.
        </p>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-1.5">
          <label htmlFor="track-phone" className="text-sm font-semibold text-foreground">
            رقم الهاتف
          </label>
          <input
            id="track-phone"
            type="tel"
            required
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${fieldClass} text-end`}
            placeholder="+249 9XX XXX XXX"
          />
        </div>

        <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
          {submitting ? "جارٍ الإرسال..." : "إرسال رمز الدخول"}
        </Button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyCode} className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
        <h3 className="text-lg font-bold text-foreground">أدخل رمز الدخول</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          إذا كان هذا الرقم مسجّلًا لدينا، وصلتك رسالة واتساب فيها رمز مكوّن من 6 أرقام.
        </p>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-1.5">
          <label htmlFor="track-code" className="text-sm font-semibold text-foreground">
            رمز الدخول
          </label>
          <input
            id="track-code"
            type="text"
            inputMode="numeric"
            required
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${fieldClass} text-center tracking-[0.5em]`}
            placeholder="000000"
          />
        </div>

        <button
          type="button"
          disabled={resendCooldown > 0}
          onClick={() => requestCode()}
          className="mt-3 text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline dark:text-secondary"
        >
          {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown} ثانية` : "إعادة إرسال الرمز"}
        </button>

        <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {submitting ? "جارٍ التحقق..." : "تأكيد الدخول"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {requests && requests.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">لا توجد طلبات مسجّلة بهذا الرقم بعد.</p>
        </div>
      ) : null}

      {requests?.map((req) => (
        <TrackedRequestCard key={req.id} request={req} onUploaded={fetchMyRequests} />
      ))}
    </div>
  );
}

function TrackedRequestCard({
  request,
  onUploaded,
}: {
  request: TrackedRequest;
  onUploaded: () => Promise<void>;
}) {
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [approving, setApproving] = React.useState(false);
  const [approvingOfferId, setApprovingOfferId] = React.useState<string | null>(null);
  const needsAction =
    request.friendlyStatus.needsDocuments ||
    request.friendlyStatus.needsPayment ||
    request.friendlyStatus.needsInvoiceApproval ||
    request.friendlyStatus.needsOfferApproval ||
    request.friendlyStatus.needsReupload;
  const reuploadDocuments = getDocumentsNeedingReupload(request.documents);

  async function upload(endpoint: string, fieldName: string, file: File | null) {
    if (!file) return;
    setUploading(endpoint);
    try {
      const body = new FormData();
      body.append(fieldName, file);
      await fetch(`${API_URL}/contact-requests/${request.id}/${endpoint}`, { method: "POST", body });
      await onUploaded();
    } finally {
      setUploading(null);
    }
  }

  async function approveInvoice() {
    setApproving(true);
    try {
      await fetch(`${API_URL}/contact-requests/${request.id}/invoice/approve`, {
        method: "POST",
        credentials: "include",
      });
      await onUploaded();
    } finally {
      setApproving(false);
    }
  }

  async function approveOffer(offerId: string) {
    setApprovingOfferId(offerId);
    try {
      await fetch(`${API_URL}/contact-requests/${request.id}/offers/${offerId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      await onUploaded();
    } finally {
      setApprovingOfferId(null);
    }
  }

  function formatLegDateTime(value: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p dir="ltr" className="text-sm font-extrabold text-primary dark:text-secondary">
            {request.referenceNumber || "-"}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{request.service || "طلب عام"}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            request.friendlyStatus.outcome === "SUCCESS"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : request.friendlyStatus.outcome === "CANCELLED"
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-primary/10 text-primary dark:text-secondary"
          }`}
        >
          {request.friendlyStatus.label}
        </span>
      </div>

      {/* Rendered outside the needsAction gate on purpose: a request in
          execution (or already delivered/cancelled) has no pending customer
          action, so a block inside {needsAction ? ...} would never render
          in exactly the case it exists for. */}
      {request.friendlyStatus.inExecution || request.friendlyStatus.outcome ? (
        <div className="mt-4 border-t border-border pt-4 text-sm text-foreground">
          حالة التنفيذ: <strong>{request.friendlyStatus.executionStageLabel}</strong>
        </div>
      ) : null}

      {needsAction ? (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          {request.friendlyStatus.needsReupload && reuploadDocuments.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              {reuploadDocuments.map((doc) => (
                <div key={doc.id}>
                  <p className="text-sm text-foreground">
                    <strong>{DOCUMENT_TYPE_LABELS[doc.type] || doc.type}</strong> مرفوض
                  </p>
                  {doc.rejectionReason ? (
                    <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">السبب: {doc.rejectionReason}</p>
                  ) : null}
                  <div className="mt-2 max-w-xs">
                    <UploadField
                      label="رفع نسخة جديدة"
                      busy={uploading === DOCUMENT_UPLOAD_ENDPOINTS[doc.type]}
                      onFile={(file) => upload(DOCUMENT_UPLOAD_ENDPOINTS[doc.type], "images", file)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {request.friendlyStatus.needsOfferApproval && request.pendingOffers.length > 0 ? (
            <div className="space-y-3">
              {request.pendingOffers.map((offer) => (
                <div key={offer.id} className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
                  <div className="space-y-1">
                    {offer.legs.map((leg) => (
                      <p key={leg.id} className="text-xs text-muted-foreground">
                        <strong className="text-foreground">{TRIP_LEG_DIRECTION_LABELS[leg.direction]}</strong>
                        {" — "}
                        {leg.carrier.name}
                        {leg.tripNumber ? ` (${leg.tripNumber})` : ""} — {leg.fromLocation} ← {leg.toLocation}
                        {formatLegDateTime(leg.departureAt) ? ` — ${formatLegDateTime(leg.departureAt)}` : ""}
                      </p>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    السعر: <strong>{offer.amount} {CURRENCY_LABELS[offer.currency] || offer.currency}</strong>
                  </p>
                  {offer.notes ? <p className="mt-1 text-xs text-muted-foreground">{offer.notes}</p> : null}
                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    className="mt-3"
                    disabled={approvingOfferId !== null}
                    onClick={() => approveOffer(offer.id)}
                  >
                    {approvingOfferId === offer.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    {approvingOfferId === offer.id ? "جارٍ الموافقة..." : "اختر هذا العرض"}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {request.friendlyStatus.needsInvoiceApproval && request.pendingInvoice ? (
            <div className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
              <p className="text-sm text-foreground">
                السعر المقترح لطلبك:{" "}
                <strong>
                  {request.pendingInvoice.amount}{" "}
                  {CURRENCY_LABELS[request.pendingInvoice.currency] || request.pendingInvoice.currency}
                </strong>
              </p>
              <Button
                type="button"
                variant="gold"
                size="sm"
                className="mt-3"
                disabled={approving}
                onClick={approveInvoice}
              >
                {approving ? <Loader2 className="size-4 animate-spin" /> : null}
                {approving ? "جارٍ الموافقة..." : "الموافقة على السعر"}
              </Button>
            </div>
          ) : null}

          {request.friendlyStatus.needsDocuments ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <UploadField
                label="صورة جواز السفر"
                busy={uploading === "passport-image"}
                onFile={(file) => upload("passport-image", "images", file)}
              />
              <UploadField
                label="صورة إقامة الضامن"
                busy={uploading === "guarantor-id-image"}
                onFile={(file) => upload("guarantor-id-image", "images", file)}
              />
              <UploadField
                label="مستندات إضافية"
                busy={uploading === "additional-documents"}
                onFile={(file) => upload("additional-documents", "images", file)}
              />
            </div>
          ) : null}

          {request.friendlyStatus.needsPayment ? (
            <div className="rounded-xl bg-background px-4 py-3">
              <p className="text-sm text-foreground">
                المبلغ المستحق:{" "}
                <strong>
                  {request.paymentAmount} {CURRENCY_LABELS[request.currency ?? ""] || request.currency}
                </strong>
              </p>
              <div className="mt-2">
                <UploadField
                  label="إشعار التحويل البنكي"
                  busy={uploading === "payment-receipt"}
                  onFile={(file) => upload("payment-receipt", "image", file)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UploadField({
  label,
  busy,
  onFile,
}: {
  label: string;
  busy: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
        <Upload className="size-3.5" />
        {busy ? "جارٍ الرفع..." : label}
      </span>
      <input
        type="file"
        accept="image/*,application/pdf"
        disabled={busy}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="text-xs"
      />
    </label>
  );
}
