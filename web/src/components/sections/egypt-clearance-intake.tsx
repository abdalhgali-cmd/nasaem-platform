"use client";

import * as React from "react";
import Link from "next/link";
import {
  BusFront,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Mail,
  Phone,
  Plane,
  UploadCloud,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

export type EgyptClearanceRequirement = {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  attachmentType: string | null;
  maxFiles: number;
  allowedMimeTypes: string[];
  maxSizeBytes: number | null;
  ocrEnabled: boolean;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "YES_NO" | "DOCUMENT";
  scope: "CUSTOMER" | "TRAVELER" | "CASE";
  options: { value: string; label: string }[] | null;
};

type Props = {
  visaTypeId: string;
  serviceId: string | null;
  requirements: EgyptClearanceRequirement[];
};

type DraftSnapshot = {
  name: string;
  phone: string;
  email: string;
  passportNo: string;
  birthDate: string;
  entryMode: "AIR" | "BORDER" | "";
};

const LOCAL_KEY = "nasaem:egypt-clearance:intake";
const TOKEN_KEY = "nasaem:egypt-clearance:draft-token";
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";

function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function EgyptClearanceIntake({ visaTypeId, serviceId, requirements }: Props) {
  const passportRequirement = React.useMemo(
    () =>
      requirements.find((item) => item.attachmentType === "passport_copy") ??
      requirements.find((item) => item.type === "DOCUMENT" && /جواز|passport/i.test(item.name)),
    [requirements]
  );
  const entryRequirement = React.useMemo(
    () =>
      requirements.find((item) => item.attachmentType === "egypt_entry_mode") ??
      requirements.find((item) => item.type === "SELECT" && /الدخول|entry/i.test(item.name)),
    [requirements]
  );

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [passportNo, setPassportNo] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [entryMode, setEntryMode] = React.useState<"AIR" | "BORDER" | "">("");
  const [passportDocumentId, setPassportDocumentId] = React.useState<string | null>(null);
  const [passportFileName, setPassportFileName] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [resultId, setResultId] = React.useState<string | null>(null);
  const draftTokenRef = React.useRef<string | null>(null);
  const hydratedRef = React.useRef(false);

  const currentSnapshot = React.useMemo<DraftSnapshot>(
    () => ({ name, phone, email, passportNo, birthDate, entryMode }),
    [name, phone, email, passportNo, birthDate, entryMode]
  );

  const hasMeaningfulProgress = Boolean(
    name || phone || email || passportNo || birthDate || entryMode || passportDocumentId
  );

  async function ensureDraft() {
    if (draftTokenRef.current) return draftTokenRef.current;

    const response = await fetch(`${API_URL}/intake-drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceKind: "visa",
        serviceId: serviceId || undefined,
        visaTypeId,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.data?.token) throw new Error("تعذّر بدء الطلب، حاول مرة أخرى");

    draftTokenRef.current = payload.data.token;
    try {
      window.localStorage.setItem(TOKEN_KEY, payload.data.token);
    } catch {
      // The server draft still works for this session even if storage is unavailable.
    }
    return payload.data.token as string;
  }

  async function saveDraft(token = draftTokenRef.current) {
    if (!token) token = await ensureDraft();
    setSaving(true);
    try {
      const answers = entryRequirement && entryMode ? { [entryRequirement.id]: entryMode } : {};
      const response = await fetch(`${API_URL}/intake-drafts/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceKind: "visa",
          serviceId: serviceId || undefined,
          visaTypeId,
          step: 0,
          name,
          phone,
          email,
          travelerCount: 1,
          answers,
          travelers: [
            {
              fullName: name,
              passportNo,
              birthDate,
              isPrimary: true,
            },
          ],
        }),
      });
      if (!response.ok) throw new Error("تعذّر حفظ تقدم الطلب");
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    if (typeof window === "undefined" || hydratedRef.current) return;
    hydratedRef.current = true;

    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<DraftSnapshot>;
        setName(saved.name ?? "");
        setPhone(saved.phone ?? "");
        setEmail(saved.email ?? "");
        setPassportNo(saved.passportNo ?? "");
        setBirthDate(saved.birthDate ?? "");
        setEntryMode(saved.entryMode ?? "");
      }
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (token) draftTokenRef.current = token;
    } catch {
      // Local persistence is only a UX enhancement.
    }
  }, []);

  React.useEffect(() => {
    if (!hydratedRef.current || resultId) return;
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(currentSnapshot));
    } catch {
      // Keep the form usable if the browser blocks localStorage.
    }

    if (!hasMeaningfulProgress) return;
    const timer = window.setTimeout(() => {
      void saveDraft().catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
    // saveDraft is intentionally driven by the actual form snapshot only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSnapshot, hasMeaningfulProgress, resultId]);

  React.useEffect(() => {
    const token = draftTokenRef.current;
    if (!token) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${API_URL}/intake-drafts/${token}`);
        if (!response.ok) return;
        const payload = await response.json();
        const draft = payload?.data;
        if (!draft || cancelled) return;

        const traveler = Array.isArray(draft.travelers) ? draft.travelers[0] : null;
        if (traveler) {
          if (!name) setName(traveler.fullName ?? "");
          if (!passportNo) setPassportNo(traveler.passportNo ?? "");
          if (!birthDate) setBirthDate(traveler.birthDate ?? "");
        }
        if (!phone) setPhone(draft.phone ?? "");
        if (!email) setEmail(draft.email ?? "");
        if (!entryMode && entryRequirement?.id && draft.answers?.[entryRequirement.id]) {
          setEntryMode(draft.answers[entryRequirement.id]);
        }
        const passportDoc = Array.isArray(draft.documents)
          ? draft.documents.find((doc: { requirementId?: string | null }) =>
              passportRequirement ? doc.requirementId === passportRequirement.id : false
            )
          : null;
        if (passportDoc) {
          setPassportDocumentId(passportDoc.id);
          setPassportFileName(passportDoc.fileName || "تم رفع الجواز");
        }
      } catch {
        // Resume failure should never block a fresh application.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryRequirement?.id, passportRequirement?.id]);

  async function uploadPassport(file: File) {
    setError("");
    if (!passportRequirement) {
      setError("إعداد مستند الجواز غير مكتمل في الخدمة. يرجى التواصل مع فريق نسائم الحرمين.");
      return;
    }
    if (passportRequirement.allowedMimeTypes.length && !passportRequirement.allowedMimeTypes.includes(file.type)) {
      setError("نوع الملف غير مدعوم. ارفع صورة JPG/PNG أو ملف PDF.");
      return;
    }
    if (passportRequirement.maxSizeBytes && file.size > passportRequirement.maxSizeBytes) {
      setError(`حجم الملف أكبر من الحد المسموح (${formatBytes(passportRequirement.maxSizeBytes)}).`);
      return;
    }

    setUploading(true);
    try {
      const token = await ensureDraft();
      await saveDraft(token);

      if (passportDocumentId) {
        await fetch(`${API_URL}/intake-drafts/${token}/documents/${passportDocumentId}`, { method: "DELETE" });
      }

      const body = new FormData();
      body.append("label", "صورة جواز السفر");
      body.append("requirementId", passportRequirement.id);
      body.append("travelerIndex", "0");
      body.append("file", file);

      const response = await fetch(`${API_URL}/intake-drafts/${token}/documents`, {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "تعذّر رفع صورة الجواز");

      const document = payload?.data?.document;
      setPassportDocumentId(document?.id ?? null);
      setPassportFileName(document?.fileName || file.name);

      const ocr = document?.ocrResult;
      if (ocr) {
        const extractedName = [ocr.givenNames, ocr.surname].filter(Boolean).join(" ").trim();
        if (extractedName && !name) setName(extractedName);
        if (ocr.documentNumber && !passportNo) setPassportNo(ocr.documentNumber);
        if (ocr.birthDate && !birthDate) setBirthDate(ocr.birthDate);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "تعذّر رفع صورة الجواز");
    } finally {
      setUploading(false);
    }
  }

  function validate() {
    if (name.trim().length < 2) return "الاسم الكامل مطلوب";
    if (phone.trim().length < 6) return "رقم الهاتف مطلوب";
    if (!passportNo.trim()) return "رقم الجواز مطلوب";
    if (!birthDate) return "تاريخ الميلاد مطلوب";
    if (!entryMode) return "اختر طريقة الدخول إلى مصر";
    if (!passportDocumentId) return "صورة جواز السفر مطلوبة";
    if (!entryRequirement) return "إعداد طريقة الدخول غير مكتمل في الخدمة";
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const token = await ensureDraft();
      await saveDraft(token);
      const response = await fetch(`${API_URL}/intake-drafts/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "طلب الموافقة الأمنية لمصر — مرحلة الموافقة الأساسية",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "تعذّر إرسال الطلب");

      const id = payload?.data?.id || payload?.data?.contactRequest?.id;
      if (!id) throw new Error("تم الإرسال لكن تعذّر قراءة رقم الطلب");
      setResultId(id);
      try {
        window.localStorage.removeItem(LOCAL_KEY);
        window.localStorage.removeItem(TOKEN_KEY);
      } catch {
        // Submission succeeded; local cleanup is optional.
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  }

  if (resultId) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-success/30 bg-success/5 p-8 text-center shadow-sm sm:p-10">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h2 className="mt-4 text-2xl font-extrabold text-foreground">تم استلام طلب الموافقة الأمنية</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          رقم طلبك <span className="font-mono font-bold text-foreground" dir="ltr">{resultId}</span>. يمكنك تحديد موعد السفر لاحقًا، حتى لو كان بعد عدة أشهر. التعميم يتم كمرحلة لاحقة قبل الرحلة.
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-start text-sm">
          <p className="font-bold text-foreground">ماذا بعد؟</p>
          <p className="mt-2 text-muted-foreground">سنراجع بيانات الموافقة والجواز أولًا. عندما تحدد رحلتك ستكمل بيانات الحجز والتعميم من نفس الطلب.</p>
        </div>
        <Button asChild variant="gold" size="lg" className="mt-6 w-full sm:w-auto">
          <Link href="/track">متابعة الطلب</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary dark:text-secondary">
          <FileCheck2 className="size-4" />
          طلب الموافقة الأساسية
        </div>
        <h2 className="mt-3 text-2xl font-extrabold text-foreground">ابدأ طلبك الآن</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          لا تحتاج إلى حجز أو تاريخ سفر الآن. يمكنك تقديم الموافقة أولًا وتحديد رحلتك لاحقًا.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground"><UserRound className="size-4" /> الاسم الكامل *</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="الاسم كما في الجواز" autoComplete="name" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground"><Phone className="size-4" /> رقم الهاتف *</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className={`${inputClass} text-start`} placeholder="+249..." dir="ltr" type="tel" autoComplete="tel" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-foreground">رقم الجواز *</span>
          <input value={passportNo} onChange={(event) => setPassportNo(event.target.value.toUpperCase())} className={inputClass} placeholder="رقم الجواز" dir="ltr" autoCapitalize="characters" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-foreground">تاريخ الميلاد *</span>
          <input value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className={inputClass} type="date" />
        </label>

        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground"><Mail className="size-4" /> البريد الإلكتروني <span className="font-normal text-muted-foreground">(اختياري)</span></span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="name@example.com" type="email" autoComplete="email" />
        </label>
      </div>

      <div className="mt-7">
        <p className="text-sm font-bold text-foreground">كيف ستدخل إلى مصر؟ *</p>
        <p className="mt-1 text-xs text-muted-foreground">حدد طريقة الدخول المتوقعة. تاريخ الرحلة نفسه يمكن إضافته لاحقًا.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setEntryMode("AIR")} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-start transition ${entryMode === "AIR" ? "border-accent bg-accent/5 ring-2 ring-accent/10" : "border-border hover:border-primary/40"}`}>
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary"><Plane className="size-5" /></span>
            <span><span className="block font-bold text-foreground">منفذ جوي</span><span className="mt-1 block text-xs text-muted-foreground">الدخول عبر المطار</span></span>
          </button>
          <button type="button" onClick={() => setEntryMode("BORDER")} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-start transition ${entryMode === "BORDER" ? "border-accent bg-accent/5 ring-2 ring-accent/10" : "border-border hover:border-primary/40"}`}>
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary"><BusFront className="size-5" /></span>
            <span><span className="block font-bold text-foreground">منفذ بري</span><span className="mt-1 block text-xs text-muted-foreground">الدخول عبر المعبر البري</span></span>
          </button>
        </div>
      </div>

      <div className="mt-7">
        <p className="text-sm font-bold text-foreground">صورة جواز السفر *</p>
        <p className="mt-1 text-xs text-muted-foreground">ارفع صفحة البيانات بوضوح. نقبل صورة أو PDF{passportRequirement?.maxSizeBytes ? ` حتى ${formatBytes(passportRequirement.maxSizeBytes)}` : ""}.</p>
        <label className={`mt-3 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${passportDocumentId ? "border-success/50 bg-success/5" : "border-border hover:border-primary/50 hover:bg-primary/[0.02]"}`}>
          {uploading ? <Loader2 className="size-9 animate-spin text-primary" /> : passportDocumentId ? <CheckCircle2 className="size-9 text-success" /> : <UploadCloud className="size-9 text-primary" />}
          <span className="mt-3 text-sm font-bold text-foreground">{uploading ? "جارٍ رفع الجواز…" : passportDocumentId ? "تم رفع الجواز" : "اضغط لرفع صورة الجواز أو PDF"}</span>
          <span className="mt-1 max-w-full truncate text-xs text-muted-foreground">{passportFileName || "JPG / PNG / WEBP / PDF"}</span>
          <input
            type="file"
            className="sr-only"
            accept={passportRequirement?.allowedMimeTypes?.join(",") || FILE_ACCEPT}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPassport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="mt-7 rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm">
        <p className="font-bold text-foreground">مهم بخصوص التعميم</p>
        <p className="mt-1 leading-relaxed text-muted-foreground">التعميم ليس شرطًا لتقديم الموافقة الآن. عندما تحدد موعد السفر سنطلب الحجز وتاريخ الدخول، ويجب تجهيز التعميم قبل الرحلة بمدة لا تقل عن 72 ساعة.</p>
      </div>

      {error ? <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive">{error}</div> : null}

      <div className="mt-7 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <span className="text-xs text-muted-foreground">{saving ? "جارٍ حفظ تقدمك تلقائيًا…" : hasMeaningfulProgress ? "يتم حفظ تقدمك تلقائيًا." : ""}</span>
        <Button type="button" variant="gold" size="lg" onClick={() => void submit()} disabled={submitting || uploading}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          إرسال طلب الموافقة
        </Button>
      </div>
    </div>
  );
}
