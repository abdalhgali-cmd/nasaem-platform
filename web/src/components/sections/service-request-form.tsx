"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Status = "idle" | "submitting" | "success" | "error";

export type ServiceRequestField = {
  name: string;
  label: string;
  type: "text" | "number" | "date";
  required?: boolean;
  min?: string | number;
  placeholder?: string;
  defaultValue?: string;
} | {
  name: string;
  label: string;
  type: "select";
  options: string[];
  required?: boolean;
  defaultValue?: string;
};

// Drives an optional repeated "traveler name" list below the regular
// fields, sized by whatever count field the page already collects
// (passenger/guest/traveler count) — a real booking needs each traveler's
// name exactly as it appears on their travel document, not just a count.
type TravelerNamesConfig = {
  countField: string;
};

type ServiceRequestFormProps = {
  id?: string;
  service: string;
  title?: string;
  description?: string;
  fields: ServiceRequestField[];
  travelerNames?: TravelerNamesConfig;
  // Maps a URL query-string key to one of `fields`' names — lets the
  // booking-search-widget's "ابحث الآن" carry its from/to/dates/etc. down
  // into this form's matching field as a starting value. Reading the URL
  // requires useSearchParams(), which only resolves on the client, so this
  // prop routes through a Suspense-wrapped variant below rather than the
  // plain statically-prerendered form.
  searchParamMap?: Record<string, string>;
};

const fieldClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary";

export function ServiceRequestForm(props: ServiceRequestFormProps) {
  if (!props.searchParamMap) {
    return <ServiceRequestFormBase {...props} />;
  }

  return (
    <React.Suspense fallback={<ServiceRequestFormBase {...props} />}>
      <ServiceRequestFormWithPrefill {...props} />
    </React.Suspense>
  );
}

function ServiceRequestFormWithPrefill(props: ServiceRequestFormProps) {
  const searchParams = useSearchParams();
  const fieldNameByParam = props.searchParamMap!;

  const fields = props.fields.map((field) => {
    const paramName = Object.keys(fieldNameByParam).find((key) => fieldNameByParam[key] === field.name);
    const value = paramName ? searchParams.get(paramName) : null;
    return value ? { ...field, defaultValue: value } : field;
  });

  return <ServiceRequestFormBase {...props} fields={fields} />;
}

function ServiceRequestFormBase({ id, service, title, description, fields, travelerNames }: ServiceRequestFormProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [referenceNumber, setReferenceNumber] = React.useState("");

  const countField = fields.find((field) => field.name === travelerNames?.countField);
  const [travelerCount, setTravelerCount] = React.useState(() => {
    const initial = Number(countField?.defaultValue ?? 1);
    return Number.isInteger(initial) && initial > 0 ? initial : 1;
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Keyed by the Arabic field label (not the internal `name`) so the
    // staff dashboard can render `details` directly without a separate
    // label-lookup table.
    const details: Record<string, string> = {};
    for (const field of fields) {
      const value = formData.get(field.name);
      if (typeof value === "string" && value.trim()) {
        details[field.label] = value.trim();
      }
    }

    if (travelerNames) {
      for (let i = 0; i < travelerCount; i++) {
        const value = formData.get(`travelerName_${i}`);
        if (typeof value === "string" && value.trim()) {
          details[`المسافر ${i + 1}`] = value.trim();
        }
      }
    }

    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          service,
          message: formData.get("message"),
          details,
          website: formData.get("website"),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "تعذّر إرسال طلبك، حاول مرة أخرى");
      }

      setReferenceNumber(payload?.data?.referenceNumber || "");
      setStatus("success");
      form.reset();
      if (travelerNames) {
        const resetCount = Number(countField?.defaultValue ?? 1);
        setTravelerCount(Number.isInteger(resetCount) && resetCount > 0 ? resetCount : 1);
      }
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
          شكرًا لتواصلك معنا. سيقوم أحد أعضاء فريقنا بمراجعة تفاصيل طلبك والتواصل معك في أقرب وقت ممكن.
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
      {title ? <h3 className="text-lg font-bold text-foreground">{title}</h3> : null}
      {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}

      {/* Honeypot: hidden from real users via CSS, never rendered to the a11y
          tree. The backend silently discards any submission where this is
          non-empty (see contact-form.tsx for the same pattern). */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor={`${id}-website`}>اتركه فارغًا</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === "error" ? (
        <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </div>
      ) : null}

      <div className={`grid gap-5 sm:grid-cols-2 ${title || description ? "mt-6" : ""}`}>
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

        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${field.name}`} className="text-sm font-semibold text-foreground">
              {field.label}
            </label>
            {field.type === "select" ? (
              <select
                id={`${id}-${field.name}`}
                name={field.name}
                required={field.required}
                defaultValue={field.defaultValue ?? field.options[0]}
                className={fieldClass}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${id}-${field.name}`}
                name={field.name}
                type={field.type}
                required={field.required}
                min={field.min}
                defaultValue={field.defaultValue}
                placeholder={field.placeholder}
                className={fieldClass}
                onChange={
                  field.name === travelerNames?.countField
                    ? (e) => setTravelerCount(Math.max(1, Number(e.target.value) || 1))
                    : undefined
                }
              />
            )}
          </div>
        ))}

        {travelerNames
          ? Array.from({ length: travelerCount }, (_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-travelerName_${i}`} className="text-sm font-semibold text-foreground">
                  اسم المسافر {i + 1} <span className="font-normal text-muted-foreground">(كما في جواز السفر)</span>
                </label>
                <input
                  id={`${id}-travelerName_${i}`}
                  name={`travelerName_${i}`}
                  required
                  className={fieldClass}
                />
              </div>
            ))
          : null}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor={`${id}-email`} className="text-sm font-semibold text-foreground">
            البريد الإلكتروني <span className="font-normal text-muted-foreground">(اختياري)</span>
          </label>
          <input id={`${id}-email`} name="email" type="email" className={fieldClass} placeholder="example@email.com" />
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
