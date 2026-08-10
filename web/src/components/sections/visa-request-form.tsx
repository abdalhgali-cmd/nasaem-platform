"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Status = "idle" | "submitting" | "success" | "error";

type VisaRequestFormProps = {
  id?: string;
  visaTypes: string[];
};

const fieldClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary";

const RELATIONSHIP_OPTIONS = ["الأم", "الأب", "الزوجة", "الزوج", "الابن/الابنة", "الأخ/الأخت", "أخرى"];

export function VisaRequestForm({ id, visaTypes }: VisaRequestFormProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [referenceNumber, setReferenceNumber] = React.useState("");

  const [visaType, setVisaType] = React.useState(visaTypes[0] ?? "");
  const [passportFiles, setPassportFiles] = React.useState<FileList | null>(null);
  const [guarantorFiles, setGuarantorFiles] = React.useState<FileList | null>(null);
  const [additionalFiles, setAdditionalFiles] = React.useState<FileList | null>(null);

  const isFamilyVisit = visaType === "الزيارة العائلية";
  const isInternational = visaType === "التأشيرات الدولية";
  const isWorkVisa = visaType === "تأشيرة العمل";
  const isEgyptClearance = visaType === "الموافقة الأمنية لمصر";

  // Mirrors visaCategories.requirements on /visas — a Saudi guarantor's
  // Iqama is only ever asked for on a family-visit invitation ("صورة إقامة
  // مرسل الزيارة من أبشر"); the other types have no such person in the
  // picture at all, so showing that upload for them was actively wrong,
  // not just unnecessary. What each type *does* need beyond the passport
  // varies (personal photo, work contract, invitation/booking) — collected
  // through the one generic "مستندات إضافية" slot, since modeling every
  // document as its own fixed upload field would balloon the backend for
  // marginal gain (see the plan's original default on this).
  const additionalDocumentsHint = isFamilyVisit
    ? "الصورة الشخصية، مستند الدعوة (خطاب الزيارة)، وأي مستند إضافي حسب صلة القرابة"
    : isWorkVisa
      ? "الصورة الشخصية وعقد العمل"
      : isInternational
        ? "الصورة الشخصية، ودعوة أو حجز الطيران والفندق حسب الدولة المقصودة"
        : "أي مستند إضافي يخص حالتك (اختياري)";
  const additionalDocumentsRequired = isFamilyVisit || isWorkVisa || isInternational;

  async function uploadFiles(requestId: string, endpoint: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const body = new FormData();
    Array.from(files).forEach((file) => body.append("images", file));
    await fetch(`${API_URL}/contact-requests/${requestId}/${endpoint}`, {
      method: "POST",
      body,
    }).catch(() => null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    const details: Record<string, string> = { "نوع التأشيرة": visaType };
    const addDetail = (name: string, label: string) => {
      const value = formData.get(name);
      if (typeof value === "string" && value.trim()) details[label] = value.trim();
    };

    addDetail("nationality", "الجنسية");
    addDetail("travelDate", "تاريخ السفر المتوقع");
    addDetail("applicants", "عدد المتقدمين");
    if (isFamilyVisit) addDetail("relationship", "صلة القرابة بالمُرسل");
    if (isInternational) addDetail("destinationCountry", "الدولة المقصودة");
    if (isWorkVisa) addDetail("officeNumber", "رقم المكتب المفوَّض");
    if (isEgyptClearance) addDetail("ticketOrCrossing", "تذكرة الطيران أو اسم المعبر البري");

    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          service: "تأشيرة",
          message: formData.get("message"),
          details,
          website: formData.get("website"),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "تعذّر إرسال طلبك، حاول مرة أخرى");
      }

      const requestId: string = payload.data.id;

      await Promise.all([
        uploadFiles(requestId, "passport-image", passportFiles),
        // Only ever relevant for a family-visit invitation — the input is
        // unmounted for every other type, but a stale FileList from a type
        // switch mid-fill could otherwise still linger in state.
        isFamilyVisit ? uploadFiles(requestId, "guarantor-id-image", guarantorFiles) : null,
        uploadFiles(requestId, "additional-documents", additionalFiles),
      ]);

      setReferenceNumber(payload?.data?.referenceNumber || "");
      setStatus("success");
      form.reset();
      setPassportFiles(null);
      setGuarantorFiles(null);
      setAdditionalFiles(null);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "تعذّر إرسال طلبك، حاول مرة أخرى");
    }
  }

  if (status === "success") {
    return (
      <div
        id={id}
        className="flex scroll-mt-28 flex-col items-center justify-center rounded-3xl border border-success/30 bg-success/5 p-10 text-center"
      >
        <CheckCircle2 className="size-12 text-success" />
        <h3 className="mt-4 text-lg font-bold text-foreground">تم استلام طلبك بنجاح</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          شكرًا لتواصلك معنا. سيقوم أحد أعضاء فريقنا بمراجعة تفاصيل طلبك والمستندات المرفقة والتواصل معك في أقرب وقت
          ممكن.
        </p>
        {referenceNumber ? (
          <>
            <p className="mt-4 text-xs text-muted-foreground">احتفظ برقمك المرجعي لمتابعة طلبك:</p>
            <p
              dir="ltr"
              className="mt-1.5 rounded-xl bg-primary/10 px-5 py-2 text-lg font-extrabold text-primary dark:text-secondary"
            >
              {referenceNumber}
            </p>
          </>
        ) : null}
        <Button type="button" variant="outline" className="mt-6" onClick={() => setStatus("idle")}>
          إرسال طلب آخر
        </Button>
      </div>
    );
  }

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      className="scroll-mt-28 rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8"
    >
      {/* Honeypot: hidden from real users via CSS, never rendered to the a11y
          tree. The backend silently discards any submission where this is
          non-empty (see contact-form.tsx for the same pattern). */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`${id}-website`}>اتركه فارغًا</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === "error" ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-semibold text-foreground">
            الاسم الكامل
          </label>
          <input id={`${id}-name`} name="name" required className={fieldClass} placeholder="اسمك الكامل" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-phone`} className="text-sm font-semibold text-foreground">
            رقم الهاتف
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            required
            dir="ltr"
            className={`${fieldClass} text-end`}
            placeholder="+249 9XX XXX XXX"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-visaType`} className="text-sm font-semibold text-foreground">
            نوع التأشيرة
          </label>
          <select
            id={`${id}-visaType`}
            name="visaType"
            required
            value={visaType}
            onChange={(e) => setVisaType(e.target.value)}
            className={fieldClass}
          >
            {visaTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-nationality`} className="text-sm font-semibold text-foreground">
            الجنسية
          </label>
          <input id={`${id}-nationality`} name="nationality" required className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-travelDate`} className="text-sm font-semibold text-foreground">
            تاريخ السفر المتوقع
          </label>
          <input id={`${id}-travelDate`} name="travelDate" type="date" className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-applicants`} className="text-sm font-semibold text-foreground">
            عدد المتقدمين
          </label>
          <input
            id={`${id}-applicants`}
            name="applicants"
            type="number"
            min={1}
            defaultValue="1"
            className={fieldClass}
          />
        </div>

        {isFamilyVisit ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-relationship`} className="text-sm font-semibold text-foreground">
              صلة القرابة بمُرسل الدعوة
            </label>
            <select id={`${id}-relationship`} name="relationship" required className={fieldClass}>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {isInternational ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-destinationCountry`} className="text-sm font-semibold text-foreground">
              الدولة المقصودة
            </label>
            <input id={`${id}-destinationCountry`} name="destinationCountry" required className={fieldClass} />
          </div>
        ) : null}

        {isWorkVisa ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-officeNumber`} className="text-sm font-semibold text-foreground">
              رقم المكتب المفوَّض <span className="font-normal text-muted-foreground">(اختياري، إن لم يتوفر سيتابعه فريقنا)</span>
            </label>
            <input id={`${id}-officeNumber`} name="officeNumber" dir="ltr" className={`${fieldClass} text-end`} />
          </div>
        ) : null}

        {isEgyptClearance ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-ticketOrCrossing`} className="text-sm font-semibold text-foreground">
              رقم تذكرة الطيران أو اسم المعبر البري
            </label>
            <input id={`${id}-ticketOrCrossing`} name="ticketOrCrossing" required className={fieldClass} />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-email`} className="text-sm font-semibold text-foreground">
            البريد الإلكتروني <span className="font-normal text-muted-foreground">(اختياري)</span>
          </label>
          <input id={`${id}-email`} name="email" type="email" className={fieldClass} placeholder="example@email.com" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-passport`} className="text-sm font-semibold text-foreground">
            صورة جواز السفر
          </label>
          <input
            id={`${id}-passport`}
            type="file"
            accept="image/*"
            multiple
            required
            onChange={(e) => setPassportFiles(e.target.files)}
            className="text-sm"
          />
        </div>
        {isFamilyVisit ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-guarantor`} className="text-sm font-semibold text-foreground">
              صورة إقامة مُرسل الدعوة (من أبشر)
            </label>
            <input
              id={`${id}-guarantor`}
              type="file"
              accept="image/*"
              multiple
              required
              onChange={(e) => setGuarantorFiles(e.target.files)}
              className="text-sm"
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-additional`} className="text-sm font-semibold text-foreground">
            مستندات إضافية <span className="font-normal text-muted-foreground">({additionalDocumentsHint})</span>
          </label>
          <input
            id={`${id}-additional`}
            type="file"
            accept="image/*,application/pdf"
            multiple
            required={additionalDocumentsRequired}
            onChange={(e) => setAdditionalFiles(e.target.files)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-message`} className="text-sm font-semibold text-foreground">
            ملاحظات إضافية <span className="font-normal text-muted-foreground">(اختياري)</span>
          </label>
          <textarea
            id={`${id}-message`}
            name="message"
            rows={3}
            className="resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            placeholder="أي تفاصيل إضافية تود إخبارنا بها..."
          />
        </div>
      </div>

      <Button type="submit" variant="gold" size="lg" className="mt-6 w-full" disabled={status === "submitting"}>
        {status === "submitting" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {status === "submitting" ? "جارٍ الإرسال..." : "إرسال الطلب"}
      </Button>
    </form>
  );
}
