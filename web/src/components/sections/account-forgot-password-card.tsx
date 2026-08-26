"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerApi, CustomerApiError } from "@/lib/customer-api";

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-end text-sm outline-none transition focus:border-primary";

export function AccountForgotPasswordCard() {
  const router = useRouter();
  const [stage, setStage] = React.useState<"phone" | "reset">("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await customerApi("/customer-auth/forgot-password", { method: "POST", body: { phone } });
      setInfo("إذا كان الرقم مسجلاً لدينا فسيصلك رمز إعادة تعيين كلمة المرور عبر واتساب.");
      setStage("reset");
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await customerApi("/customer-auth/reset-password", { method: "POST", body: { phone, code, newPassword } });
      router.push("/account/login");
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
      {error ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}
      {info && stage === "reset" ? (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          {info}
        </div>
      ) : null}

      {stage === "phone" ? (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
              <KeyRound className="size-6" />
            </span>
            <h2 className="text-lg font-bold text-foreground">استعادة كلمة المرور</h2>
            <p className="text-sm text-muted-foreground">أدخل رقم هاتفك المسجل وسنرسل لك رمز إعادة التعيين عبر واتساب.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-semibold text-foreground">
              رقم الهاتف
            </label>
            <input
              id="phone"
              type="tel"
              dir="ltr"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="+249 9XX XXX XXX"
            />
          </div>
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {submitting ? "جارٍ الإرسال..." : "إرسال رمز إعادة التعيين"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-sm font-semibold text-foreground">
              رمز التحقق
            </label>
            <input
              id="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              dir="ltr"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
              placeholder="000000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPassword" className="text-sm font-semibold text-foreground">
              كلمة المرور الجديدة
            </label>
            <input
              id="newPassword"
              type="password"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" variant="gold" size="lg" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? "جارٍ الحفظ..." : "تعيين كلمة المرور الجديدة"}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/account/login" className="font-semibold text-primary hover:underline">
          العودة لتسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
