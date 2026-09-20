"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial data loading synchronizes with the API. */

import * as React from "react";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminRequest } from "@/lib/admin-api";

type NotificationRow = { id: string; title: string; message: string; type: string; readAt: string | null; createdAt: string };

export function NotificationsManager() {
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await adminRequest<{ data: NotificationRow[] }>("/notifications?limit=100");
      setRows(payload.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الإشعارات");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function markRead(id: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)));
    try {
      await adminRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
    } catch {
      void load();
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5 px-4 py-7 sm:px-6 lg:px-10">
      {error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}
      <div className="flex items-center justify-between rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bell className="size-5" /></div>
          <div>
            <h2 className="text-xl font-black">الإشعارات</h2>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">إشعاراتك الشخصية: إسناد طلب، تغيير حالة، أو دفعة جديدة.</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />تحديث
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {loading ? <p className="text-sm text-muted-foreground">جاري التحميل...</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد إشعارات حتى الآن.</p> : null}
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => (row.readAt ? undefined : void markRead(row.id))}
            className={`rounded-2xl border p-4 text-start transition ${row.readAt ? "border-border bg-card" : "border-primary/30 bg-primary/5"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-black">{row.title}</p>
              {!row.readAt ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">جديد</span> : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.message}</p>
            <p className="mt-2 text-xs text-muted-foreground" dir="ltr">{new Date(row.createdAt).toLocaleString("ar-SA", { calendar: "gregory" })}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
