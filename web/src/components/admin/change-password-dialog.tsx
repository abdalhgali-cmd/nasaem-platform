"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { Button } from "@/components/ui/button";

const input = "mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus:border-primary";

// Staff self-service password change. The current password is required; on
// success the server signs the member out everywhere else and keeps this session.
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  if (!open) return null;

  function close() {
    setCurrent(""); setNext(""); setConfirm(""); setError(""); setDone(false);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (next.length < 10 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return setError("كلمة المرور الجديدة: 10 أحرف على الأقل وتحتوي على حرف ورقم.");
    if (next !== confirm) return setError("تأكيد كلمة المرور غير مطابق.");
    setBusy(true);
    try {
      const response = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تغيير كلمة المرور");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="تغيير كلمة المرور" onClick={close}>
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-black">تغيير كلمة المرور</h2>
        {done ? (
          <div className="mt-4">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><Check className="me-2 inline size-4" />تم تغيير كلمة المرور. تم تسجيل خروجك من الأجهزة الأخرى.</p>
            <Button type="button" className="mt-4 w-full" onClick={close}>إغلاق</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm font-bold">كلمة المرور الحالية<input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} /></label>
            <label className="block text-sm font-bold">كلمة المرور الجديدة<input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} /></label>
            <label className="block text-sm font-bold">تأكيد كلمة المرور الجديدة<input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} /></label>
            {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm font-bold text-destructive" role="alert">{error}</p> : null}
            <div className="flex gap-3">
              <Button type="submit" variant="gold" className="flex-1" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}حفظ</Button>
              <Button type="button" variant="outline" onClick={close}>إلغاء</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
