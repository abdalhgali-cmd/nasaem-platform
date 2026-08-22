"use client";

import * as React from "react";
import { Calculator, CheckCircle2, CreditCard, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Props = {
  requestId: string;
  reference: string;
  onUpdated?: () => void;
};

type Preview = {
  sourceAmount: number;
  exchangeRate: number;
  marginPercent: number;
  convertedCost: number;
  marginAmount: number;
  customerPrice: number;
};

export function OperationsPricingPanel({ requestId, reference, onUpdated }: Props) {
  const [sourceAmount, setSourceAmount] = React.useState("");
  const [exchangeRate, setExchangeRate] = React.useState("");
  const [marginPercent, setMarginPercent] = React.useState("0");
  const [currency, setCurrency] = React.useState("USD");
  const [description, setDescription] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  async function previewPrice() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(requestId)}/pricing-preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAmount, exchangeRate, marginPercent }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر حساب السعر");
      setPreview(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حساب السعر");
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    if (!preview) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(requestId)}/pricing-invoice`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAmount, exchangeRate, marginPercent, sourceCurrency: currency, description }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر إنشاء الفاتورة");
      setMessage(`تم إنشاء الفاتورة للطلب ${reference}`);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الفاتورة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-primary" />
        <h4 className="font-black">التسعير والدفع</h4>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-bold text-muted-foreground">المبلغ الأصلي<input value={sourceAmount} onChange={(e) => setSourceAmount(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="100" /></label>
        <label className="text-xs font-bold text-muted-foreground">العملة<select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="USD">USD</option><option value="SAR">SAR</option><option value="AED">AED</option><option value="EGP">EGP</option></select></label>
        <label className="text-xs font-bold text-muted-foreground">سعر الصرف<input value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="600" /></label>
        <label className="text-xs font-bold text-muted-foreground">هامش الوكالة %<input value={marginPercent} onChange={(e) => setMarginPercent(e.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="5" /></label>
        <label className="text-xs font-bold text-muted-foreground lg:col-span-1">وصف السعر<input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="طيران + خدمة" /></label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void previewPrice()} disabled={busy || !sourceAmount || !exchangeRate}><Calculator className="size-4" />حساب السعر</Button>
        <Button type="button" variant="gold" onClick={() => void createInvoice()} disabled={busy || !preview}><FileText className="size-4" />إنشاء الفاتورة</Button>
      </div>

      {preview ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">التكلفة بعد التحويل</span><div className="mt-1 font-black">{preview.convertedCost.toLocaleString()} SDG</div></div>
          <div className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">هامش الوكالة</span><div className="mt-1 font-black">{preview.marginAmount.toLocaleString()} SDG</div></div>
          <div className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">سعر العميل</span><div className="mt-1 font-black text-primary">{preview.customerPrice.toLocaleString()} SDG</div></div>
          <div className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">سعر الصرف المستخدم</span><div className="mt-1 font-black">{preview.exchangeRate.toLocaleString()}</div></div>
        </div>
      ) : null}

      {message ? <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="size-4" />{message}</div> : null}
      {error ? <div className="mt-3 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-bold text-destructive"><CreditCard className="size-4" />{error}</div> : null}
    </div>
  );
}
