"use client";

import * as React from "react";

/* eslint-disable react-hooks/set-state-in-effect -- checklist state synchronizes with the selected API-backed service. */
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  Copy,
  MessageCircle,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { siteConfig } from "@/lib/site-config";

export type IntakeServiceKind = "umrah" | "visa" | "package";

type PublicService = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: string;
  currency: string;
  fxRateToSdg: number | null;
  priceSdg: number | null;
};

type PublicVisaType = {
  id: string;
  code: string;
  name: string;
  country: string;
  description: string | null;
  basePrice: string;
  currency: string;
  fxRateToSdg: number | null;
  priceSdg: number | null;
  serviceId: string | null;
  category: string;
};

type Traveler = {
  fullName: string;
  passportNo: string;
  nationality: string;
};

// A checklist item from the Requirements Engine (Platform 3.0 Phase 5/8,
// GET /api/visa-types/:id/requirements/public and
// GET /api/services/:id/requirements/public) — admin-configured per visa
// type or service, replacing what used to be a static, hand-maintained
// document list here.
type PublicRequirement = {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  required: boolean;
  attachmentType: string | null;
  maxFiles: number;
  allowedMimeTypes: string[];
  maxSizeBytes: number | null;
  ocrEnabled: boolean;
};

type DocumentSlot = {
  requirement: PublicRequirement;
  files: File[];
};

// Same MIME allowlist the backend's upload middleware enforces for every
// contact-request document (backend/src/middleware/upload.middleware.js) —
// used only as the fallback `accept` hint when a requirement doesn't
// configure its own allowedMimeTypes.
const DEFAULT_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

// Matches createContactRequestSchema's `documents`/documentLabels/
// documentRequirementIds arrays (backend/src/modules/contact-requests/
// contact-requests.validators.js), each capped at 6 — enforced here too so
// the wizard never lets a customer assemble a submission the API would
// reject outright.
const MAX_TOTAL_DOCUMENTS = 6;

// `attachmentType` is free text set per-requirement by staff (see the
// Requirements Engine) and is usually left empty, so passport-specific
// guidance is detected from the requirement's own admin-authored name/
// description instead of a fixed enum. This only ever nudges the customer
// on photo quality (lighting, all four corners visible, correct page) —
// never a legal claim like validity duration, which nobody here is
// qualified to invent.
const PASSPORT_KEYWORD_PATTERN = /جواز|passport/i;

function isPassportRequirement(requirement: PublicRequirement) {
  return (
    PASSPORT_KEYWORD_PATTERN.test(requirement.attachmentType || "") ||
    PASSPORT_KEYWORD_PATTERN.test(requirement.name) ||
    PASSPORT_KEYWORD_PATTERN.test(requirement.description || "")
  );
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
  return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
}

const SERVICE_TITLES: Record<IntakeServiceKind, string> = {
  umrah: "العمرة",
  visa: "التأشيرة",
  package: "الباقة",
};

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary";
const labelClass = "text-sm font-semibold text-foreground";

function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  backDisabled,
  nextDisabled,
  nextLabel = "التالي",
  loading = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <Button type="button" variant="outline" onClick={onBack} disabled={backDisabled}>
        <ChevronRight className="size-4" />
        السابق
      </Button>
      <Button type="button" variant="gold" onClick={onNext} disabled={nextDisabled || loading}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {nextLabel}
        {!loading ? <ChevronLeft className="size-4" /> : null}
      </Button>
    </div>
  );
}

export function ServiceIntakeWizard({
  service,
  initialServiceCode,
  visaCategory,
}: {
  service: IntakeServiceKind;
  /** Deep-link into a specific package/visa type by its Service/VisaType code (e.g. from a package card's CTA). */
  initialServiceCode?: string;
  /**
   * Restricts the "اختر نوع التأشيرة" step to one VisaType.category
   * (INTERNATIONAL/UMRAH/FAMILY_VISIT/OTHER — see backend/src/utils/enums.js).
   * Filtered server-side via GET /services/public?visaCategory=... — this is
   * what actually keeps Umrah/Family Visit visa types out of the
   * International Visas flow, not a client-side exclusion list.
   */
  visaCategory?: string;
}) {
  const [step, setStep] = React.useState(0);
  const [loadingCatalog, setLoadingCatalog] = React.useState(true);
  const [catalogError, setCatalogError] = React.useState("");
  const [services, setServices] = React.useState<PublicService[]>([]);
  const [visaTypes, setVisaTypes] = React.useState<PublicVisaType[]>([]);

  // Selection (step "select") — only ever set directly by the user clicking
  // a card; the effective selection (below) also folds in the Umrah
  // auto-selection and the deep-link (initialServiceCode) as pure
  // derivations, so no effect is needed to keep this "in sync".
  const [selectedServiceId, setSelectedServiceId] = React.useState("");
  const [selectedVisaTypeId, setSelectedVisaTypeId] = React.useState("");

  // Customer info (step "customer")
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");

  // Service details (step "details")
  const [travelerCount, setTravelerCount] = React.useState(1);
  const [travelers, setTravelers] = React.useState<Traveler[]>([
    { fullName: "", passportNo: "", nationality: "" },
  ]);
  const [notes, setNotes] = React.useState("");

  // Documents (step "documents") — the live checklist fetched from the
  // Requirements Engine for whichever service/visa type is selected, and
  // the files attached against each checklist item's id (keyed by
  // requirement id rather than label, so switching selection cleanly
  // drops files that no longer apply instead of silently keeping them
  // under a stale label).
  const [requirements, setRequirements] = React.useState<PublicRequirement[]>([]);
  const [loadingRequirements, setLoadingRequirements] = React.useState(false);
  const [documentFilesByRequirement, setDocumentFilesByRequirement] = React.useState<
    Record<string, File[]>
  >({});
  const [documentErrorsByRequirement, setDocumentErrorsByRequirement] = React.useState<
    Record<string, string>
  >({});

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [result, setResult] = React.useState<{ id: string } | null>(null);
  const [copiedRequestNumber, setCopiedRequestNumber] = React.useState(false);

  // Draft save/resume (per-browser, via localStorage — no account or
  // backend change required). File objects can't be serialized, so only
  // the typed-in fields are restored; the customer is told to re-attach
  // documents after resuming rather than the wizard silently pretending
  // they're still there.
  const draftKey = React.useMemo(
    () => `nasaem-intake-draft:${service}:${initialServiceCode || "default"}`,
    [service, initialServiceCode]
  );
  const [draftAvailable, setDraftAvailable] = React.useState(false);
  const [draftRestored, setDraftRestored] = React.useState(false);
  // Guards against overwriting a real saved draft with the wizard's blank
  // initial state during the one render before we've checked localStorage.
  const readyToSaveRef = React.useRef(false);

  type DraftShape = {
    step: number;
    selectedServiceId: string;
    selectedVisaTypeId: string;
    name: string;
    phone: string;
    email: string;
    travelerCount: number;
    travelers: Traveler[];
    notes: string;
  };

  function readDraft(): DraftShape | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as DraftShape) : null;
    } catch {
      return null;
    }
  }

  React.useEffect(() => {
    setDraftAvailable(Boolean(readDraft()));
    readyToSaveRef.current = true;
    // Only re-check when the draft slot itself changes (e.g. deep-linking
    // into a different package/visa type) — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  React.useEffect(() => {
    if (!readyToSaveRef.current || result || typeof window === "undefined") return;
    const draft: DraftShape = {
      step,
      selectedServiceId,
      selectedVisaTypeId,
      name,
      phone,
      email,
      travelerCount,
      travelers,
      notes,
    };
    // A completely untouched form has nothing worth saving yet.
    const isEmpty =
      !name && !phone && !email && !notes && !selectedServiceId && !selectedVisaTypeId &&
      travelers.every((t) => !t.fullName && !t.passportNo && !t.nationality);
    try {
      if (isEmpty && step === 0) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage can legitimately be unavailable (private browsing, quota) —
      // the wizard must keep working without persistence either way.
    }
  }, [draftKey, step, selectedServiceId, selectedVisaTypeId, name, phone, email, travelerCount, travelers, notes, result]);

  function resumeDraft() {
    const draft = readDraft();
    if (!draft) return;
    setSelectedServiceId(draft.selectedServiceId || "");
    setSelectedVisaTypeId(draft.selectedVisaTypeId || "");
    setName(draft.name || "");
    setPhone(draft.phone || "");
    setEmail(draft.email || "");
    setTravelerCount(draft.travelerCount || 1);
    setTravelers(draft.travelers?.length ? draft.travelers : [{ fullName: "", passportNo: "", nationality: "" }]);
    setNotes(draft.notes || "");
    setStep(Math.max(0, draft.step || 0));
    setDraftAvailable(false);
    setDraftRestored(true);
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setDraftAvailable(false);
  }

  React.useEffect(() => {
    if (!result) return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [result, draftKey]);

  React.useEffect(() => {
    let ignore = false;

    const query = visaCategory ? `?visaCategory=${encodeURIComponent(visaCategory)}` : "";

    fetch(`${API_URL}/services/public${query}`)
      .then((res) => res.json())
      .then((payload) => {
        if (ignore) return;
        setServices(payload?.data?.services ?? []);
        setVisaTypes(payload?.data?.visaTypes ?? []);
      })
      .catch(() => {
        if (!ignore) setCatalogError("تعذّر تحميل قائمة الخدمات، حاول تحديث الصفحة");
      })
      .finally(() => {
        if (!ignore) setLoadingCatalog(false);
      });

    return () => {
      ignore = true;
    };
  }, [visaCategory]);

  const packageServices = React.useMemo(
    () => services.filter((s) => s.category === "UMRAH_PACKAGE"),
    [services]
  );
  const umrahService = React.useMemo(
    () => services.find((s) => s.category === "umrah"),
    [services]
  );

  // Effective selection = the user's explicit click, falling back to a
  // derived default — the (only) Umrah service for that service kind, or
  // the deep-linked package/visa type from initialServiceCode (e.g. a
  // package card's "اطلب هذه الباقة" link). Pure derivation, computed on
  // every render — no effect/setState needed to keep it "in sync".
  const effectiveServiceId =
    service === "umrah"
      ? (umrahService?.id ?? "")
      : selectedServiceId ||
        (service === "package" && initialServiceCode
          ? (packageServices.find((p) => p.code === initialServiceCode)?.id ?? "")
          : "");

  const effectiveVisaTypeId =
    selectedVisaTypeId ||
    (service === "visa" && initialServiceCode
      ? (visaTypes.find((v) => v.code === initialServiceCode)?.id ?? "")
      : "");

  const selectedPackage = packageServices.find((p) => p.id === effectiveServiceId);
  const selectedVisaType = visaTypes.find((v) => v.id === effectiveVisaTypeId);

  // The single source of truth for the price shown to the customer is
  // whatever Pricing/Admin published against this Service/VisaType — never
  // a value invented here. A published price of 0 reads the same as "not
  // published yet" (the review step must not claim a free service by
  // accident), so both fall back to the same "price pending review" copy.
  const selectedPriceItem: PublicService | PublicVisaType | undefined =
    service === "umrah" ? umrahService : service === "package" ? selectedPackage : selectedVisaType;
  const hasPublishedPrice = Boolean(selectedPriceItem && Number(selectedPriceItem.basePrice) > 0);

  // Umrah and Package are Services; Visa uses the selected VisaType — each
  // has its own Requirements Engine endpoint (both backed by the same
  // checklist model, see backend/src/modules/requirements). Only the id
  // changing re-triggers the fetch, so typing in later steps doesn't
  // refetch the same checklist.
  const requirementsEndpoint =
    service === "visa"
      ? effectiveVisaTypeId
        ? `visa-types/${effectiveVisaTypeId}`
        : null
      : effectiveServiceId
        ? `services/${effectiveServiceId}`
        : null;

  React.useEffect(() => {
    let ignore = false;

    if (!requirementsEndpoint) {
      setRequirements([]);
      setDocumentFilesByRequirement({});
      return;
    }

    setLoadingRequirements(true);
    setDocumentFilesByRequirement({});

    fetch(`${API_URL}/${requirementsEndpoint}/requirements/public`)
      .then((res) => res.json())
      .then((payload) => {
        if (ignore) return;
        setRequirements(Array.isArray(payload?.data) ? payload.data : []);
      })
      .catch(() => {
        if (!ignore) setRequirements([]);
      })
      .finally(() => {
        if (!ignore) setLoadingRequirements(false);
      });

    return () => {
      ignore = true;
    };
  }, [requirementsEndpoint]);

  const documentSlots: DocumentSlot[] = requirements.map((requirement) => ({
    requirement,
    files: documentFilesByRequirement[requirement.id] ?? [],
  }));

  const totalAttachedDocuments = documentSlots.reduce((sum, slot) => sum + slot.files.length, 0);

  // Mirrors the checks upload.middleware.js applies server-side (MIME
  // allowlist + size cap, both sourced from this same requirement) so a
  // customer finds out immediately instead of after submitting.
  function validateDocumentFile(requirement: PublicRequirement, file: File): string | null {
    if (requirement.allowedMimeTypes.length && !requirement.allowedMimeTypes.includes(file.type)) {
      return "نوع الملف غير مدعوم. يرجى رفع صورة (JPG/PNG) أو ملف PDF.";
    }
    if (requirement.maxSizeBytes && file.size > requirement.maxSizeBytes) {
      return `حجم الملف كبير جدًا. الحد الأقصى ${formatFileSize(requirement.maxSizeBytes)}.`;
    }
    return null;
  }

  function addDocumentFile(requirementId: string, requirement: PublicRequirement, file: File) {
    const error = validateDocumentFile(requirement, file);
    setDocumentErrorsByRequirement((prev) => ({ ...prev, [requirementId]: error || "" }));
    if (error) return;
    setDocumentFilesByRequirement((prev) => ({
      ...prev,
      [requirementId]: [...(prev[requirementId] ?? []), file],
    }));
  }

  function removeDocumentFile(requirementId: string, index: number) {
    setDocumentFilesByRequirement((prev) => ({
      ...prev,
      [requirementId]: (prev[requirementId] ?? []).filter((_, i) => i !== index),
    }));
  }

  // "select" step only applies to visa/package (Umrah has no sub-type to
  // choose in this phase — see the auto-select effect above).
  const steps = service === "umrah" ? ["customer", "details", "documents", "review"] : [
    "select",
    "customer",
    "details",
    "documents",
    "review",
  ];

  function updateTravelerCount(count: number) {
    const clamped = Math.max(1, Math.min(20, count));
    setTravelerCount(clamped);
    setTravelers((prev) => {
      const next = [...prev];
      while (next.length < clamped) next.push({ fullName: "", passportNo: "", nationality: "" });
      return next.slice(0, clamped);
    });
  }

  function updateTraveler(index: number, patch: Partial<Traveler>) {
    setTravelers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function canGoNext() {
    const current = steps[step];

    if (current === "select") {
      return service === "package" ? Boolean(effectiveServiceId) : Boolean(effectiveVisaTypeId);
    }

    if (current === "customer") {
      return name.trim().length >= 2 && phone.trim().length >= 6;
    }

    return true;
  }

  async function handleCopyRequestNumber() {
    if (!result?.id || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(result.id);
      setCopiedRequestNumber(true);
      window.setTimeout(() => setCopiedRequestNumber(false), 2200);
    } catch {
      setCopiedRequestNumber(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("phone", phone);
      if (email) formData.append("email", email);

      const serviceLabel =
        service === "umrah"
          ? umrahService?.name ?? "العمرة"
          : service === "package"
            ? (selectedPackage?.name ?? "باقة سفر")
            : (selectedVisaType?.name ?? "تأشيرة");

      formData.append("service", serviceLabel);
      formData.append(
        "message",
        notes.trim() || `طلب ${SERVICE_TITLES[service]} عبر نموذج الحجز الإلكتروني`
      );

      if (service === "umrah" && umrahService) formData.append("serviceId", umrahService.id);
      if (service === "package" && effectiveServiceId) formData.append("serviceId", effectiveServiceId);
      if (service === "visa" && effectiveVisaTypeId) {
        formData.append("visaTypeId", effectiveVisaTypeId);
        if (selectedVisaType?.serviceId) formData.append("serviceId", selectedVisaType.serviceId);
      }

      formData.append("travelerCount", String(travelerCount));

      const filledTravelers = travelers.filter((t) => t.fullName.trim().length > 0);
      formData.append(
        "intakeData",
        JSON.stringify({
          travelers: filledTravelers,
          notes: notes.trim() || undefined,
        })
      );

      // Parallel arrays, same order as the `documents` files — the
      // requirement id lets the backend apply that requirement's own
      // MIME/size/max-files rules and (when configured) run passport OCR
      // against the right file, instead of the upload being unlabeled.
      const documentLabels: string[] = [];
      const documentRequirementIds: string[] = [];
      const documentFilesToSend: File[] = [];
      for (const slot of documentSlots) {
        for (const file of slot.files) {
          documentLabels.push(slot.requirement.name);
          documentRequirementIds.push(slot.requirement.id);
          documentFilesToSend.push(file);
        }
      }
      formData.append("documentLabels", JSON.stringify(documentLabels));
      formData.append("documentRequirementIds", JSON.stringify(documentRequirementIds));
      documentFilesToSend.forEach((file) => formData.append("documents", file));

      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "تعذّر إرسال طلبك، حاول مرة أخرى");
      }

      setResult({ id: payload.data.id });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "تعذّر إرسال طلبك، حاول مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-success/30 bg-success/5 p-10 text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h3 className="mt-4 text-xl font-bold text-foreground">تم استلام طلبك</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          شكرًا لك، أرسلت طلب خدمة إلى فريق نسائم الحرمين. سيقوم فريقنا بمراجعته والتواصل معك.
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-start">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">الخدمة</span>
            <span className="font-semibold text-foreground">{SERVICE_TITLES[service]}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">رقم الطلب</span>
            <div className="flex items-center gap-2" dir="ltr">
              <span className="font-mono font-bold text-foreground">{result.id}</span>
              <button
                type="button"
                onClick={handleCopyRequestNumber}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="نسخ رقم الطلب"
              >
                {copiedRequestNumber ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span aria-live="polite">{copiedRequestNumber ? "تم النسخ" : "نسخ"}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-background p-5 text-start">
          <h3 className="text-sm font-bold text-foreground">ماذا سيحدث الآن؟</h3>
          <ol className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <li><span className="font-semibold text-foreground">1.</span> سنراجع بيانات طلبك والمستندات المرفقة.</li>
            <li><span className="font-semibold text-foreground">2.</span> سيتواصل معك فريقنا عند الحاجة إلى معلومة أو مستند إضافي.</li>
            <li><span className="font-semibold text-foreground">3.</span> يمكنك متابعة الحالة باستخدام رقم الطلب من صفحة التتبع.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">هذا طلب خدمة أولي، وليس عملية دفع أو طلبًا مؤكدًا داخل حساب العميل.</p>
        </div>
        <Button asChild variant="gold" size="lg" className="mt-6 w-full">
          <Link href="/track">تابع طلبك من هنا</Link>
        </Button>
        <a
          href={`https://wa.me/${siteConfig.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground outline-none transition hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MessageCircle className="size-4" />
          تحتاج مساعدة؟ تواصل معنا عبر واتساب
        </a>
      </div>
    );
  }

  if (loadingCatalog) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-600 dark:text-red-400">
        {catalogError}
      </div>
    );
  }

  const current = steps[step];

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
      {draftAvailable ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <span className="font-semibold text-foreground">لديك طلب غير مكتمل — هل تريد متابعته؟</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="gold" onClick={resumeDraft}>
              متابعة الطلب
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={discardDraft}>
              بدء طلب جديد
            </Button>
          </div>
        </div>
      ) : null}
      {draftRestored ? (
        <div className="mb-6 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          تمت استعادة بياناتك المحفوظة. يرجى إعادة اختيار أي مستندات مرفقة سابقًا، فهي لا تُحفظ تلقائيًا.
        </div>
      ) : null}
      <div className="mb-8 flex items-center gap-2" dir="ltr">
        {steps.map((s, index) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-accent" : "bg-border"}`}
          />
        ))}
      </div>

      {current === "select" ? (
        <StepShell
          title={service === "package" ? "اختر الباقة" : "اختر نوع التأشيرة"}
          description="حدد الخيار المناسب لطلبك."
        >
          <div className="grid gap-3">
            {(service === "package" ? packageServices : visaTypes).map((item) => {
              const isSelected =
                service === "package" ? item.id === effectiveServiceId : item.id === effectiveVisaTypeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    service === "package" ? setSelectedServiceId(item.id) : setSelectedVisaTypeId(item.id)
                  }
                  className={`rounded-2xl border p-4 text-start transition ${
                    isSelected ? "border-accent bg-accent/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-foreground">{item.name}</span>
                    {service !== "package" ? (
                      <span className="text-xs text-muted-foreground">{(item as PublicVisaType).country}</span>
                    ) : null}
                  </div>
                  {Number(item.basePrice) > 0 ? (
                    <span className="mt-1 block text-xs text-muted-foreground" dir="ltr">
                      يبدأ من {Number(item.basePrice).toLocaleString("en-US")} {item.currency}
                    </span>
                  ) : null}
                  {item.currency !== "SDG" && item.priceSdg != null ? (
                    <span className="mt-1 block text-xs font-bold text-primary">
                      يعادل {Math.round(item.priceSdg).toLocaleString("en-US")} جنيه سوداني
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <StepNav
            backDisabled
            onBack={() => {}}
            onNext={() => setStep((s) => s + 1)}
            nextDisabled={!canGoNext()}
          />
        </StepShell>
      ) : null}

      {current === "customer" ? (
        <StepShell title="بيانات العميل" description="سنستخدمها للتواصل معك بخصوص طلبك.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>الاسم الكامل</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="اسمك الكامل"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>رقم الهاتف</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                dir="ltr"
                className={`${inputClass} text-end`}
                placeholder="+249 9XX XXX XXX"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className={labelClass}>البريد الإلكتروني (اختياري)</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className={inputClass}
                placeholder="example@email.com"
              />
            </div>
          </div>
          <StepNav
            onBack={() => setStep((s) => s - 1)}
            backDisabled={step === 0}
            onNext={() => setStep((s) => s + 1)}
            nextDisabled={!canGoNext()}
          />
        </StepShell>
      ) : null}

      {current === "details" ? (
        <StepShell title="بيانات الخدمة" description="أخبرنا بتفاصيل رحلتك.">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>عدد المسافرين</label>
              <input
                type="number"
                min={1}
                max={20}
                value={travelerCount}
                onChange={(e) => updateTravelerCount(Number(e.target.value) || 1)}
                className={`${inputClass} w-32`}
              />
            </div>

            <div className="flex flex-col gap-3">
              {travelers.map((traveler, index) => (
                <div key={index} className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-3">
                  <input
                    value={traveler.fullName}
                    onChange={(e) => updateTraveler(index, { fullName: e.target.value })}
                    placeholder={`اسم المسافر ${index + 1}`}
                    className={`${inputClass} h-10 text-xs`}
                  />
                  <input
                    value={traveler.passportNo}
                    onChange={(e) => updateTraveler(index, { passportNo: e.target.value })}
                    placeholder="رقم الجواز (اختياري)"
                    dir="ltr"
                    className={`${inputClass} h-10 text-xs`}
                  />
                  <input
                    value={traveler.nationality}
                    onChange={(e) => updateTraveler(index, { nationality: e.target.value })}
                    placeholder="الجنسية (اختياري)"
                    className={`${inputClass} h-10 text-xs`}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>ملاحظات (اختياري)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
                placeholder="أي تفاصيل إضافية تساعدنا في تجهيز طلبك..."
              />
            </div>
          </div>
          <StepNav
            onBack={() => setStep((s) => s - 1)}
            onNext={() => setStep((s) => s + 1)}
          />
        </StepShell>
      ) : null}

      {current === "documents" ? (
        <StepShell
          title="المستندات المطلوبة"
          description="يمكنك رفعها الآن لتسريع مراجعة طلبك، أو إرسال الطلب بدونها ورفعها لاحقًا من صفحة تتبع الطلب."
        >
          <div className="flex flex-col gap-3">
            {loadingRequirements ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : (
              documentSlots.map((slot) => {
                const remainingSlots = Math.max(
                  0,
                  Math.min(
                    slot.requirement.maxFiles - slot.files.length,
                    MAX_TOTAL_DOCUMENTS - totalAttachedDocuments
                  )
                );
                const accept = slot.requirement.allowedMimeTypes.length
                  ? slot.requirement.allowedMimeTypes.join(",")
                  : DEFAULT_ATTACHMENT_ACCEPT;

                return (
                  <div key={slot.requirement.id} className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {slot.requirement.name}
                        {slot.requirement.required ? (
                          <span className="ms-1 text-xs font-bold text-destructive">*</span>
                        ) : (
                          <span className="ms-1 text-xs font-normal text-muted-foreground">(اختياري)</span>
                        )}
                      </span>
                      {remainingSlots > 0 ? (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <Upload className="size-4" />
                          اختر ملفًا
                          <input
                            type="file"
                            accept={accept}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              if (file) addDocumentFile(slot.requirement.id, slot.requirement, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    {slot.requirement.description ? (
                      <p className="text-xs text-muted-foreground">{slot.requirement.description}</p>
                    ) : null}
                    {isPassportRequirement(slot.requirement) ? (
                      <p className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
                        نصيحة: صوّر صفحة البيانات في الجواز كاملة وبإضاءة جيدة، بحيث تظهر الأركان
                        الأربعة وجميع الكتابة بوضوح دون انعكاس ضوئي أو اهتزاز.
                      </p>
                    ) : null}
                    {documentErrorsByRequirement[slot.requirement.id] ? (
                      <p className="text-xs font-semibold text-destructive">
                        {documentErrorsByRequirement[slot.requirement.id]}
                      </p>
                    ) : null}
                    {slot.files.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {slot.files.map((file, index) => (
                          <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs text-foreground">
                            <span className="truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeDocumentFile(slot.requirement.id, index)}
                              className="font-bold text-destructive"
                            >
                              إزالة
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
            {!loadingRequirements && documentSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مستندات مطلوبة مسبقًا لهذه الخدمة.</p>
            ) : null}
          </div>
          <StepNav
            onBack={() => setStep((s) => s - 1)}
            onNext={() => setStep((s) => s + 1)}
          />
        </StepShell>
      ) : null}

      {current === "review" ? (
        <StepShell title="مراجعة الطلب" description="تأكد من صحة بياناتك قبل الإرسال.">
          <div className="flex flex-col gap-4 text-sm">
            <div className="rounded-xl border border-border/70 p-4">
              <span className="font-bold text-foreground">بيانات العميل</span>
              <div className="mt-2 flex flex-col gap-1 text-muted-foreground">
                <span>{name}</span>
                <span dir="ltr">{phone}</span>
                {email ? <span>{email}</span> : null}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 p-4">
              <span className="font-bold text-foreground">تفاصيل الرحلة</span>
              <div className="mt-2 flex flex-col gap-1 text-muted-foreground">
                <span>عدد المسافرين: {travelerCount}</span>
                {travelers
                  .filter((t) => t.fullName.trim())
                  .map((t, i) => (
                    <span key={i}>— {t.fullName}</span>
                  ))}
                {notes ? <span>ملاحظات: {notes}</span> : null}
              </div>
            </div>
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
              <span className="font-bold text-foreground">التكلفة</span>
              <div className="mt-2 flex flex-col gap-1">
                {hasPublishedPrice && selectedPriceItem ? (
                  <>
                    <span className="font-bold text-foreground" dir="ltr">
                      {Number(selectedPriceItem.basePrice).toLocaleString("en-US")} {selectedPriceItem.currency}
                    </span>
                    {selectedPriceItem.currency !== "SDG" && selectedPriceItem.priceSdg != null ? (
                      <span className="text-xs text-muted-foreground">
                        يعادل {Math.round(selectedPriceItem.priceSdg).toLocaleString("en-US")} جنيه سوداني
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">يتم تحديد التكلفة بعد مراجعة الطلب</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 p-4">
              <span className="font-bold text-foreground">المستندات</span>
              <div className="mt-2 flex flex-col gap-1 text-muted-foreground">
                {documentSlots.length === 0 ? (
                  <span>لا توجد مستندات</span>
                ) : (
                  documentSlots.map((slot) => (
                    <span key={slot.requirement.id}>
                      {slot.requirement.name}: {slot.files.length > 0 ? `تم إرفاق ${slot.files.length}` : "لم يُرفق بعد"}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {submitError ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {submitError}
            </p>
          ) : null}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              <ChevronRight className="size-4" />
              السابق
            </Button>
            <Button type="button" variant="gold" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </Button>
          </div>
        </StepShell>
      ) : null}

      <div className="mt-6 border-t border-border pt-4 text-center">
        <a
          href={`https://wa.me/${siteConfig.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
        >
          تفضّل التواصل المباشر؟ راسلنا عبر واتساب
        </a>
      </div>
    </div>
  );
}

