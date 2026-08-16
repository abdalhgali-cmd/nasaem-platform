"use client";

import * as React from "react";
import { CheckCircle2, Loader2, LogOut, PhoneCall, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type TrackedRequestStatus = "NEW" | "CONTACTED" | "CLOSED";

type TrackedRequest = {
  id: string;
  service: string | null;
  message: string;
  status: TrackedRequestStatus;
  statusLabel: string;
  createdAt: string;
};

type Stage = "checking" | "phone" | "code" | "requests";

const STATUS_BADGE_CLASS: Record<TrackedRequestStatus, string> = {
  NEW: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  CONTACTED: "bg-primary/10 text-primary dark:text-secondary",
  CLOSED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

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
    const res = await fetch(`${API_URL}/tracking/requests`, {
      credentials: "include",
    });

    if (!res.ok) {
      return { loggedIn: false as const };
    }

    const payload = await res.json().catch(() => null);
    return { loggedIn: true as const, requests: payload?.data ?? [] };
  }, []);

  // Checks for an existing tracking session on mount (a real "synchronize
  // with an external system" effect). Guarded with `ignore` per React's own
  // data-fetching-in-effects guidance so a stale response from a fast
  // unmount/remount can never clobber newer state.
  React.useEffect(() => {
    let ignore = false;

    loadRequests().then((result) => {
      if (ignore) return;

      if (result.loggedIn) {
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
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[req.status]}`}
                  >
                    {req.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{req.message}</p>
                <p className="mt-3 text-xs text-muted-foreground" dir="ltr">
                  {formatTrackedDate(req.createdAt)}
                </p>
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
