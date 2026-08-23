"use client";

import * as React from "react";
import { Building2, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type PaymentAccount = {
  id: string;
  name: string;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  iban: string | null;
  currency: string;
};

export function PaymentAccountsPanel() {
  const [accounts, setAccounts] = React.useState<PaymentAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    fetch(`${API_URL}/payment-accounts/public/active`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) return { data: [] as PaymentAccount[] };
        if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر تحميل حسابات الدفع");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setAccounts(payload.data || []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "تعذر تحميل حسابات الدفع");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard is a convenience only; the visible value remains available.
    }
  }

  if (loading) {
    return (
      <section className="mx-auto mt-6 max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> جارٍ تحميل حسابات الدفع...</div>
        </div>
      </section>
    );
  }

  if (error || accounts.length === 0) return null;

  return (
    <section className="mx-auto mt-6 max-w-5xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div>
          <p className="text-xs font-bold text-muted-foreground">الدفع البنكي</p>
          <h2 className="mt-1 text-xl font-black">حسابات الدفع المتاحة</h2>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">استخدم الحساب المناسب للعملة الظاهرة في طلبك، ثم ارفع إشعار التحويل من صفحة تتبع الطلب.</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div>
                  <div>
                    <h3 className="font-black">{account.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{account.bankName} · {account.currency}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                  <span className="text-muted-foreground">اسم الحساب</span>
                  <span className="font-bold text-end">{account.accountName}</span>
                </div>
                {account.accountNumber ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                    <span className="text-muted-foreground">رقم الحساب</span>
                    <div className="flex items-center gap-2"><span dir="ltr" className="font-bold">{account.accountNumber}</span><Button type="button" variant="ghost" size="icon" onClick={() => void copy(account.accountNumber!)} aria-label="نسخ رقم الحساب"><Copy className="size-4" /></Button></div>
                  </div>
                ) : null}
                {account.iban ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                    <span className="text-muted-foreground">IBAN</span>
                    <div className="flex items-center gap-2"><span dir="ltr" className="font-bold break-all">{account.iban}</span><Button type="button" variant="ghost" size="icon" onClick={() => void copy(account.iban!)} aria-label="نسخ IBAN"><Copy className="size-4" /></Button></div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
