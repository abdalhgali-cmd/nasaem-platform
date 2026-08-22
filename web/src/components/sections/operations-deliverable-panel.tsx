"use client";

import * as React from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";

type Props = {
  requestId: string;
  reference: string;
  onUpdated?: () => void;
};

export function OperationsDeliverablePanel({ requestId, reference, onUpdated }: Props) {
  const [label, setLabel] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  async function upload() {
    if (!file || !label.trim()) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.append("label", label.trim());
      form.append("file", file);

      const response = await fetch(`${API_URL}/contact-requests/${encodeURIComponent(requestId)}/deliverables`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "تعذر رفع ملف التسليم");
      }

      setMessage(`تم رفع وتسليم الملف للطلب ${reference}`);
      setLabel("");
      setFile(null);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفع ملف التسليم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2">
        <FileUp className="size-4 text-emerald-700" />
        <h4 className="font-black text-emerald-900">التسليم النهائي</h4>
      </div>
      <p className="mt-1 text-xs leading-6 text-emerald-800/80">
        ارفع التذكرة أو التأشيرة أو القسيمة ليتمكن العميل من تحميلها من صفحة المتابعة.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          placeholder="مثال: التذكرة النهائية"
        />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="h-10 rounded-lg border bg-background px-3 py-2 text-xs"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="gold" onClick={() => void upload()} disabled={busy || !label.trim() || !file}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
          {busy ? "جارٍ الرفع..." : "رفع وتسليم"}
        </Button>
      </div>
      {message ? <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-bold text-emerald-700"><CheckCircle2 className="size-4" />{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</div> : null}
    </div>
  );
}
