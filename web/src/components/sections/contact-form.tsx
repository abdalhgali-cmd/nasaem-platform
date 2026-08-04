"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "submitting" | "success";

const services = [
  "باقة عمرة",
  "تأشيرة",
  "حجز طيران",
  "حجز فندق",
  "باقة سفر شاملة",
  "استفسار آخر",
];

export function ContactForm() {
  const [status, setStatus] = React.useState<Status>("idle");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");

    // This marketing site has no backend endpoint wired up yet — this
    // simulates submission so the form is fully demonstrable end-to-end.
    // Wire this to a real API route (or the staff back-office API) before
    // going live.
    window.setTimeout(() => {
      setStatus("success");
      e.currentTarget.reset();
    }, 900);
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
