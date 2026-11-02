"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeAdminNext } from "@/components/admin/admin-shell";
import { API_URL } from "@/lib/api-url";

// Staff sign-in for the unified admin. The session is the API's own cookie
// (same endpoint and rules as before); after it, staff land on /admin, or on
// the /admin page they were sent from.
export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeAdminNext(searchParams.get("next"));
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [working, setWorking] = React.useState(false);

  // Already signed in: straight to the dashboard.
  React.useEffect(() => {
    let active = true;
    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then((response) => { if (active && response.ok) router.replace(next); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [next, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setError(response.status === 401 ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : payload?.message || "تعذر تسجيل الدخول، حاول مرة أخرى");
        return;
      }
      router.replace(next);
    } catch {
      setError("تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مرة أخرى");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, fixed size */}
        <img src="/brand/admin-logo-on-navy.png" alt="نسائم الحرمين للسفر والسياحة" width={216} height={79} className="mx-auto h-auto w-[216px] max-w-full" />
        <p className="mt-3 text-sm font-bold text-[var(--nh-gold-300)]">لوحة الإدارة</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xl" aria-labelledby="admin-login-title" noValidate={false}>
        <h1 id="admin-login-title" className="text-xl font-extrabold">تسجيل دخول الموظفين</h1>
        <div className="space-y-1.5">
          <label htmlFor="admin-email" className="text-sm font-bold">البريد الإلكتروني</label>
          <input id="admin-email" name="email" type="email" required autoComplete="username" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-[10px] border border-border bg-background px-3 text-start text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="admin-password" className="text-sm font-bold">كلمة المرور</label>
          <input id="admin-password" name="password" type="password" required autoComplete="current-password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-[10px] border border-border bg-background px-3 text-start text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        {error ? <p role="alert" className="rounded-[10px] border border-destructive/20 bg-destructive/5 p-3 text-sm font-bold text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={working}><LogIn className="size-4" />{working ? "جارٍ الدخول..." : "دخول"}</Button>
      </form>
    </div>
  );
}
