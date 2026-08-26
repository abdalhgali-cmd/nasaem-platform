"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerApi, CustomerApiError } from "@/lib/customer-api";

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-end text-sm outline-none transition focus:border-primary";

export function AccountAuthCard({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") {
        await customerApi("/customer-auth/register", {
          method: "POST",
          body: { fullName, phone, email: email || undefined, password },
        });
      } else {
        await customerApi("/customer-auth/login", {
          method: "POST",
          body: { identifier, password },
        });
      }
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "حدث خطأ غير متوقع، حاول مرة أخرى");
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
            {mode === "register" ? <UserPlus className="size-6" /> : <LogIn className="size-6" />}
          </span>
          <h2 className="text-lg font-bold text-foreground">
            {mode === "register" ? "إنشاء حساب جديد" : "تسجيل الدخول"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "register"
              ? "أنشئ حسابك لمتابعة طلباتك ومستنداتك والاستفادة من الكوبونات."
              : "سجّل الدخول لمتابعة طلباتك ومستنداتك وكوبوناتك."}
          </p>
        </div>

        {mode === "register" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fullName" className="text-sm font-semibold text-foreground">
              الاسم الكامل
            </label>
            <input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="الاسم الكامل"
            />
          </div>
        ) : null}

        {mode === "register" ? (
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
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="identifier" className="text-sm font-semibold text-foreground">
              رقم الهاتف أو البريد الإلكتروني
            </label>
            <input
              id="identifier"
              dir="ltr"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
              placeholder="+249 9XX XXX XXX"
            />
          </div>
        )}

        {mode === "register" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-semibold text-foreground">
              البريد الإلكتروني (اختياري)
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="name@example.com"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold text-foreground">
            كلمة المرور
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
          />
          {mode === "login" ? (
            <Link href="/account/forgot-password" className="mt-1 self-start text-xs font-semibold text-primary hover:underline">
              نسيت كلمة المرور؟
            </Link>
          ) : null}
        </div>

        <Button type="submit" variant="gold" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitting ? "جارٍ المعالجة..." : mode === "register" ? "إنشاء الحساب" : "تسجيل الدخول"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "register" ? (
            <>
              لديك حساب بالفعل؟{" "}
              <Link href="/account/login" className="font-semibold text-primary hover:underline">
                تسجيل الدخول
              </Link>
            </>
          ) : (
            <>
              ليس لديك حساب؟{" "}
              <Link href="/account/register" className="font-semibold text-primary hover:underline">
                إنشاء حساب جديد
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
