"use client";

import * as React from "react";
import { AlertTriangle, BusFront, CheckCircle2, FileUp, Loader2, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type CircularStatus =
  | "INVALID_DATE"
  | "ENTRY_DATE_PASSED"
  | "BOOKING_REQUIRED"
  | "WAITING_APPROVAL"
  | "TOO_LATE_FOR_NORMAL_CIRCULAR"
  | "TIME_CONFIRMATION_REQUIRED"
  | "READY_FOR_CIRCULAR";

type EgyptTravelPlan = {
  entryMode: "AIR" | "BORDER";
  bookingStatus: "EXISTING" | "NEEDS_NASAEM";
  entryDate: string;
  ticketDocumentId?: string | null;
  circularStatus: CircularStatus;
  daysUntilEntry: number | null;
};

type TrackingRequest = {
  id: string;
  status: "NEW" | "CONTACTED" | "CLOSED";
  visaType: { code?: string; name: string } | null;
  deliverables: { id: string; label: string }[];
  intakeData?: { egyptTravel?: EgyptTravelPlan | null } | null;
};

const EGYPT_CLEARANCE_CODE = "VISA-EGYPT-CLEARANCE";
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function statusCopy(plan: EgyptTravelPlan | null | undefined) {
  if (!plan) {
    return {
      tone: "neutral" as const,
      title: "يمكنك تحديد السفر لاحقًا",
      body: "طلب الموافقة لا يحتاج حجزًا عند البداية. عندما تحدد الرحلة، أكمل البيانات هنا ليبقى الحجز والتعميم مرتبطين بنفس الطلب.",
    };
  }

  switch (plan.circularStatus) {
    case "BOOKING_REQUIRED":
      return {
        tone: "neutral" as const,
        title: "تم إرسال طلب الحجز لفريقنا",
        body: "سيتم ترتيب الحجز داخل نفس ملف الموافقة. بعد تثبيت الحجز والتاريخ نراجع جاهزية التعميم.",
      };
    case "WAITING_APPROVAL":
      return {
        tone: "neutral" as const,
        title: "بيانات السفر محفوظة",
        body: "الحجز مرتبط بطلبك، لكن التعميم ينتظر صدور الموافقة الأمنية أولًا.",
      };
    case "TOO_LATE_FOR_NORMAL_CIRCULAR":
      return {
        tone: "warning" as const,
        title: "الموعد قريب جدًا للتعميم العادي",
        body: "الموعد الظاهر أقل من 72 ساعة تقريبًا. لا يعتبر النظام التعميم صالحًا تلقائيًا؛ تواصل مع فريق الوكالة فورًا لمراجعة الحالة.",
      };
    case "TIME_CONFIRMATION_REQUIRED":
      return {
        tone: "warning" as const,
        title: "نحتاج تأكيد وقت الدخول",
        body: "التاريخ بعد 3 أيام بالضبط، لكن وقت الدخول غير مسجل. لذلك لا نؤكد اكتمال شرط 72 ساعة قبل مراجعة التوقيت مع الفريق.",
      };
    case "READY_FOR_CIRCULAR":
      return {
        tone: "success" as const,
        title: "بياناتك جاهزة لمرحلة التعميم",
        body: "الموافقة والحجز والتاريخ متوفرة، والموعد بعيد بما يكفي وفق البيانات الحالية لبدء متابعة التعميم.",
      };
    default:
      return {
        tone: "warning" as const,
        title: "راجع تاريخ السفر",
        body: "تعذّر اعتماد تاريخ الدخول الحالي. صححه أو تواصل مع فريق الوكالة.",
      };
  }
}

function EgyptCaseCard({ request, onSaved }: { request: TrackingRequest; onSaved: () => Promise<void> }) {
  const current = request.intakeData?.egyptTravel ?? null;
  const [entryMode, setEntryMode] = React.useState<"AIR" | "BORDER">(current?.entryMode ?? "AIR");
  const [bookingStatus, setBookingStatus] = React.useState<"EXISTING" | "NEEDS_NASAEM">(
    current?.bookingStatus ?? "EXISTING"
  );
  const [entryDate, setEntryDate] = React.useState(current?.entryDate ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const copy = statusCopy(current);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!entryDate) {
      setError("حدد تاريخ الدخول المتوقع إلى مصر");
      return;
    }
    if (bookingStatus === "EXISTING" && !file && !current?.ticketDocumentId) {
      setError("ارفع صورة أو PDF للتذكرة/الحجز");
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      body.append("entryMode", entryMode);
      body.append("bookingStatus", bookingStatus);
      body.append("entryDate", entryDate);
      if (file) body.append("file", file);

      const response = await fetch(`${API_URL}/tracking/requests/${request.id}/egypt-travel-plan`, {
        method: "POST",
        credentials: "include",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "تعذّر حفظ بيانات السفر");

      setFile(null);
      setSuccess(payload?.message || "تم حفظ بيانات السفر");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر حفظ بيانات السفر");
    } finally {
      setSaving(false);
    }
  }

  const toneClass =
    copy.tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : copy.tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-background";

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground">استكمال السفر والتعميم</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            رقم الطلب <span className="font-mono font-semibold" dir="ltr">{request.id}</span>
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          الموافقة الأمنية لمصر
        </span>
      </div>

      <div className={`mt-4 rounded-xl border p-4 ${toneClass}`}>
        <div className="flex items-start gap-2">
          {copy.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          ) : copy.tone === "warning" ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          ) : null}
          <div>
            <p className="text-sm font-bold text-foreground">{copy.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.body}</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">طريقة الدخول</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntryMode("AIR")}
              className={`rounded-xl border p-3 text-sm font-semibold transition ${
                entryMode === "AIR" ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
              }`}
            >
              <Plane className="mx-auto mb-1 size-5" />
              منفذ جوي
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("BORDER")}
              className={`rounded-xl border p-3 text-sm font-semibold transition ${
                entryMode === "BORDER" ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
              }`}
            >
              <BusFront className="mx-auto mb-1 size-5" />
              منفذ بري
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-foreground" htmlFor={`egypt-entry-${request.id}`}>
            تاريخ الدخول المتوقع إلى مصر
          </label>
          <input
            id={`egypt-entry-${request.id}`}
            type="date"
            required
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            التعميم يحتاج 72 ساعة على الأقل قبل الدخول. إذا كان التاريخ قريبًا جدًا سيطلب منك النظام التواصل مع الفريق بدل إعطاء تأكيد غير صحيح.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">هل لديك حجز بالفعل؟</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setBookingStatus("EXISTING")}
              className={`rounded-xl border p-3 text-start text-sm transition ${
                bookingStatus === "EXISTING" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className="font-bold text-foreground">نعم، لدي حجز</span>
              <span className="mt-1 block text-xs text-muted-foreground">سأرفع التذكرة أو إثبات الحجز.</span>
            </button>
            <button
              type="button"
              onClick={() => setBookingStatus("NEEDS_NASAEM")}
              className={`rounded-xl border p-3 text-start text-sm transition ${
                bookingStatus === "NEEDS_NASAEM" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span className="font-bold text-foreground">لا، أريد الحجز من نسائم الحرمين</span>
              <span className="mt-1 block text-xs text-muted-foreground">يرسل طلب الحجز للموظف داخل نفس المعاملة.</span>
            </button>
          </div>
        </div>

        {bookingStatus === "EXISTING" ? (
          <div className="rounded-xl border border-dashed border-border p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-foreground">
              <FileUp className="size-5 text-primary" />
              <span>{current?.ticketDocumentId ? "استبدال/تحديث التذكرة أو الحجز" : "رفع التذكرة أو إثبات الحجز"}</span>
              <input
                type="file"
                className="sr-only"
                accept={FILE_ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">صورة JPG/PNG/WebP أو ملف PDF.</p>
            {file ? <p className="mt-2 text-xs font-semibold text-primary">{file.name}</p> : null}
            {!file && current?.ticketDocumentId ? (
              <p className="mt-2 text-xs text-emerald-600">يوجد حجز مرفوع بالفعل على هذا الطلب.</p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p> : null}

        <Button type="submit" variant="gold" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {bookingStatus === "NEEDS_NASAEM" ? "إرسال طلب الحجز" : "حفظ بيانات السفر والتعميم"}
        </Button>
      </form>
    </article>
  );
}

export function EgyptClearanceTravelFollowup() {
  const [requests, setRequests] = React.useState<TrackingRequest[]>([]);
  const [authenticated, setAuthenticated] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/tracking/requests`, { credentials: "include" });
      if (!response.ok) {
        setAuthenticated(false);
        return;
      }
      const payload = await response.json().catch(() => null);
      setAuthenticated(true);
      setRequests(Array.isArray(payload?.data) ? payload.data : []);
    } catch {
      // The main TrackingPanel owns the login/error UX. This enhancement
      // stays silent until an authenticated tracking session exists.
    }
  }, []);

  React.useEffect(() => {
    void load();
    // TrackingPanel creates the OTP session independently. While there is no
    // session yet, a short low-frequency retry lets this same page reveal the
    // Egypt follow-up immediately after verification without requiring a
    // reload. Once authenticated the interval stops.
    if (authenticated) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [authenticated, load]);

  const egyptRequests = requests.filter(
    (request) => request.visaType?.code === EGYPT_CLEARANCE_CODE && request.status !== "CLOSED"
  );

  if (!authenticated || egyptRequests.length === 0) return null;

  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-foreground">السفر والتعميم للموافقة الأمنية</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          هذه مرحلة لاحقة من نفس طلب الموافقة. يمكنك استكمالها عندما تحدد السفر، حتى لو كان ذلك بعد أشهر من تقديم الموافقة.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {egyptRequests.map((request) => (
          <EgyptCaseCard key={request.id} request={request} onSaved={load} />
        ))}
      </div>
    </div>
  );
}
