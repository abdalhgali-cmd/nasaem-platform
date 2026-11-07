"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useAdminUser } from "@/components/admin/admin-shell";
import { ADMIN_TOOLS, adminTool, canUseTool, toolFrameSrc } from "@/components/admin/tools/admin-tools";

// One existing back-office screen inside the unified admin. Same origin, so
// the frame's height follows its content (no second scroll bar), and the
// record it opens is mirrored in this page's ?id= (a copied link reopens it).
export function AdminToolFrame({ toolKey, id }: { toolKey: string; id: string | null }) {
  const user = useAdminUser();
  const tool = adminTool(toolKey);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(640);
  const [loaded, setLoaded] = React.useState(false);
  // The first src only: later record changes come from inside the frame.
  const [src] = React.useState(() => (tool ? toolFrameSrc(tool, id) : ""));
  const cleanupRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => cleanupRef.current?.(), []);

  const onLoad = React.useCallback(() => {
    setLoaded(true);
    cleanupRef.current?.();
    cleanupRef.current = null;
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win) return;
    const resize = () => setHeight(Math.max(480, doc.documentElement.scrollHeight));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(doc.documentElement);
    const syncRecord = () => {
      const match = win.location.hash.match(/^#\/[a-z]+\/([^/?#]+)/);
      const url = new URL(window.location.href);
      if (match) url.searchParams.set("id", decodeURIComponent(match[1]));
      else url.searchParams.delete("id");
      window.history.replaceState(window.history.state, "", url);
    };
    win.addEventListener("hashchange", syncRecord);
    cleanupRef.current = () => { observer.disconnect(); win.removeEventListener("hashchange", syncRecord); };
  }, []);

  if (!tool) return null;
  if (!user) return <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-10">جاري التحقق من الصلاحية...</div>;
  if (!canUseTool(tool, user.role)) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">هذا القسم غير متاح لدورك. <Link href="/admin" className="underline">العودة إلى مركز العمليات</Link></p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-2 py-4 sm:px-6 lg:px-10">
      {!loaded ? <p className="px-2 py-4 text-sm text-muted-foreground">جاري التحميل...</p> : null}
      <iframe ref={frameRef} src={src} title={tool.label} onLoad={onLoad} className="block w-full border-0 bg-transparent" style={{ height }} data-testid="admin-tool-frame" />
    </div>
  );
}

export function AdminToolsIndex() {
  const user = useAdminUser();
  const tools = ADMIN_TOOLS.filter((tool) => !user || canUseTool(tool, user.role));
  return (
    <div className="mx-auto grid max-w-7xl gap-3 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-10">
      {tools.map((tool) => (
        <Link key={tool.key} href={`/admin/tools/${tool.key}`} className="group flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-[var(--nh-gold-500)]">
          <span>
            <span className="block font-extrabold">{tool.label}</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">{tool.description}</span>
          </span>
          <ChevronLeft className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-[var(--nh-gold-700)]" />
        </Link>
      ))}
    </div>
  );
}
