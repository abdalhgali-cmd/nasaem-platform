"use client";

import * as React from "react";
import Link from "next/link";
import { RequestConfirmation } from "./request-confirmation";
import { readRequestReference, uncertainRequestMessage } from "@/lib/request-response";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { LegalDisclosure } from "@/components/legal-disclosure";

type Status = "idle" | "submitting" | "success" | "error";

type PublicService = { id: string; name: string; category: string; active: boolean };
const OTHER_SERVICE = "استفسار آخر";

export function ContactForm() {
  const submitLock = React.useRef(false);
  const [requestId, setRequestId] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [services, setServices] = React.useState<PublicService[]>([]);

  React.useEffect(() => {
    let ignore = false;
    fetch(`${API_URL}/services/public`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!ignore) setServices(payload?.data?.services ?? []);
      })
      .catch(() => {
        if (!ignore) setServices([]);
      });
    return () => { ignore = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          service: formData.get("service"),
          message: formData.get("message"),
          // Honeypot: real users never see or fill this field (see CSS
          // below). Left empty here on every legitimate submission.
          website: formData.get("website"),
        }),
      });

      setRequestId(await readRequestReference(response));

      setStatus("success");
      form.reset();
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        (error instanceof TypeError || error instanceof DOMException) ? uncertainRequestMessage : error instanceof Error ? error.message : uncertainRequestMessage
      );
    } finally {
      submitLock.current = false;
    }
  }

  if (status === "success") {
    return <RequestConfirmation requestId={requestId} onNewRequest={() => { setRequestId(""); setStatus("idle"); }} />;
  }

  return (
    <form
      aria-busy={status === "submitting"}
      onSubmit={handleSubmit}
      className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8"
    >
      {/* Honeypot: hidden from real users via CSS (not `type="hidden"`, which
          some bots skip) and never rendered to a11y tree via aria-hidden +
          tabIndex=-1. The backend silently discards any submission where
          this is non-empty. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">اتركه فارغًا</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === "error" ? (
        <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
          <Link href="/track" className="mt-2 block font-bold underline">تحقق من طلباتك قبل إعادة الإرسال</Link>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-semibold text-foreground">
            الاسم الكامل
          </label>
          <input
            id="name"
            name="name"
            minLength={2}
            maxLength={120}
            autoComplete="name"
            required
            className="h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary"
            placeholder="اسمك الكامل"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-semibold text-foreground">
            رقم الهاتف
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            minLength={6}
            maxLength={30}
            autoComplete="tel"
            required
            dir="ltr"
            className="h-12 rounded-xl border border-border bg-background px-4 text-end text-sm outline-none transition focus:border-primary"
            placeholder="+249 9XX XXX XXX"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="email" className="text-sm font-semibold text-foreground">
            البريد الإلكتروني (اختياري)
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary"
            placeholder="example@email.com"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="service" className="text-sm font-semibold text-foreground">
            الخدمة المطلوبة
          </label>
          <select
            id="service"
            name="service"
            className="h-12 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary"
            defaultValue={OTHER_SERVICE}
          >
            {services.map((service) => (
              <option key={service.id} value={service.name}>
                {service.name}
              </option>
            ))}
            <option value={OTHER_SERVICE}>{OTHER_SERVICE}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="message" className="text-sm font-semibold text-foreground">
            رسالتك
          </label>
          <textarea
            id="message"
            name="message"
            minLength={5}
            maxLength={2000}
            required
            rows={4}
            className="resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            placeholder="أخبرنا بتفاصيل طلبك..."
          />
        </div>
      </div>

      <LegalDisclosure />

      <Button
        type="submit"
        variant="gold"
        size="lg"
        className="mt-6 w-full"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        {status === "submitting" ? "جارٍ الإرسال..." : "إرسال الطلب"}
      </Button>
    </form>
  );
}
