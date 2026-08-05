"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "submitting" | "success" | "error";

const services = [
  "باقة عمرة",
  "تأشيرة",
  "حجز طيران",
  "حجز فندق",
  "باقة سفر شاملة",
  "استفسار آخر",
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

export function ContactForm() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMessage, setErrorMessage] = React.useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`${API_URL}/contact-requests`, {
        method: "POST",
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

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || "تعذّر إرسال طلبك، حاول مرة أخرى");
      }

      setStatus("success");
      form.reset();
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "تعذّر إرسال طلبك، حاول مرة أخرى"
      );
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-success/30 bg-success/5 p-10 text-center">
        <CheckCircle2 className="size-12 text-success" />
        <h3 className="mt-4 text-lg font-bold text-foreground">
          تم استلام طلبك بنجاح
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          شكرًا لتواصلك معنا. سيقوم أحد أعضاء فريقنا بالتواصل معك في أقرب وقت
          ممكن.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6"
          onClick={() => setStatus("idle")}
        >
          إرسال طلب آخر
        </Button>
      </div>
    );
  }

  return (
    <form
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
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
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
            required
            dir="ltr"
            className="h-12 rounded-xl border border-border bg-background px-4 text-end text-sm outline-none transition focus:border-primary"
            placeholder="+249 9XX XXX XXX"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="email" className="text-sm font-semibold text-foreground">
            البريد الإلكتروني
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
            defaultValue={services[0]}
          >
            {services.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="message" className="text-sm font-semibold text-foreground">
            رسالتك
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={4}
            className="resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-primary"
            placeholder="أخبرنا بتفاصيل طلبك..."
          />
        </div>
      </div>

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
