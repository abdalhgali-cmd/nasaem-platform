"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerApi, CustomerApiError } from "@/lib/customer-api";
import { saveCustomerToken } from "@/lib/customer-session";

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-end text-sm outline-none transition focus:border-primary";

type AuthResult = { token?: string; customer?: unknown };

export function AccountAuthCard({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [existingAccount, setExistingAccount] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  // One request at a time: a second tap never sends a second registration.
  const inFlight = React.useRef(false);

  // Coming from «الحساب موجود» or an ended session (?identifier= / ?expired=1).
  React.useEffect(() => {
    if (mode !== "login" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const known = params.get("identifier");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the query string on mount.
    if (known) setIdentifier(known);
    if (params.get("expired") === "1") setNotice("انتهت جلستك، يرجى تسجيل الدخول مرة أخرى.");
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setExistingAccount(false);
    setSubmitting(true);
    let signedIn = false;
    try {
      const result =
        mode === "register"
          ? await customerApi<AuthResult>("/customer-auth/register", {
              method: "POST",
              body: { fullName, phone, email: email || undefined, password },
            })
          : await customerApi<AuthResult>("/customer-auth/login", {
              method: "POST",
              body: { identifier, password },
            });
      // The account exists and the server opened its session: keep the token
      // (the cross-site cookie may be blocked) and go straight to the account.
      saveCustomerToken(result?.token);
      signedIn = true;
      router.replace("/account");
      router.refresh();
    } catch (err) {
      if (err instanceof CustomerApiError && err.status === 409 && mode === "register") {
        setExistingAccount(/الهاتف/.test(err.message));
      }
      setError(err instanceof CustomerApiError ? err.message : "حدث خطأ غير متوقع، حاول مرة أخرى");
    } finally {
      // Stay disabled while navigating to the account after success.
      if (!signedIn) {
        inFlight.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-8">
      {notice ? (
        <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert" data-testid="auth-error">
          {error}
          {existingAccount ? (
            <Link
              href={`/account/login?identifier=${encodeURIComponent(phone)}`}
              className="mt-2 block font-semibold text-primary hover:underline"
              data-testid="existing-account-login"
            >
              تسجيل الدخول بهذا الرقم
            </Link>
          ) : null}
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
