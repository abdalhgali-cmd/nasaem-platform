"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ImageIcon,
  ClipboardCheck,
  ClipboardList,
  ChevronDown,
  CreditCard,
  FileCheck2,
  Flag,
  Gauge,
  Layers3,
  LogOut,
  Menu,
  Palette,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  UserRoundCog,
  X,
} from "lucide-react";
import { API_URL } from "@/lib/api-url";

export type AdminUser = {
  id: string;
  fullName: string;
  email?: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE" | "ACCOUNTANT" | "CONTENT_MANAGER";
};

const navigation = [
  { href: "/admin/operations", label: "مركز العمليات", icon: Gauge, roles: undefined },
  { href: "/admin/notifications", label: "الإشعارات", icon: Bell, roles: undefined },
  // Smart Case Operations — Release C. The per-case workspace, open to the
  // roles that actually work cases; ACCOUNTANT/CONTENT_MANAGER never do.
  { href: "/admin/cases", label: "مساحة عمل الحالات", icon: ClipboardList, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
  { href: "/admin/users", label: "المستخدمون", icon: Users, roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/admin/roles", label: "الأدوار والصلاحيات", icon: ShieldCheck, roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/admin/services", label: "الخدمات", icon: BriefcaseBusiness, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
  { href: "/admin/visas", label: "التأشيرات والمتطلبات", icon: Layers3, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
  { href: "/admin/umrah", label: "مجموعات العمرة", icon: Sparkles, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
  { href: "/admin/approvals", label: "الموافقات", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
  { href: "/admin/pricing", label: "الأسعار والباقات", icon: Settings2, roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/admin/features", label: "الخصائص", icon: Flag, roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/admin/assignments", label: "الإسناد", icon: UserRoundCog, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
  { href: "/admin/documents", label: "المستندات", icon: FileCheck2, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"] },
  { href: "/admin/appearance", label: "المظهر", icon: Palette, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
  { href: "/admin/media", label: "الوسائط", icon: ImageIcon, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
  { href: "/admin/settings", label: "إعدادات الموقع", icon: Settings2, roles: ["SUPER_ADMIN", "ADMIN"] },
  { href: "/admin/activity", label: "سجل النشاط", icon: Activity, roles: ["SUPER_ADMIN", "ADMIN"] },
] as const;

const navigationGroups = [
  { id: "daily", label: "العمل اليومي", items: [navigation[0], navigation[2], navigation[1], navigation[11], navigation[12]] },
  { id: "finance", label: "المال والتقارير", items: [
    { href: "/admin/reports", label: "التقارير", icon: BarChart3, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { href: "/admin/payment-review", label: "مراجعة الدفعات", icon: CreditCard, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    navigation[8], navigation[9],
  ] },
  { id: "services", label: "الخدمات والموقع", items: [navigation[5], navigation[6], navigation[7], navigation[13], navigation[14]] },
  { id: "system", label: "الفريق والنظام", items: [navigation[3], navigation[4], navigation[10], navigation[15], navigation[16]] },
] as const;

const roleLabels: Record<AdminUser["role"], string> = {
  SUPER_ADMIN: "المدير الأعلى",
  ADMIN: "مدير النظام",
  EMPLOYEE: "موظف عمليات",
  ACCOUNTANT: "المحاسب",
  CONTENT_MANAGER: "مدير المحتوى",
};

export function AdminShell({ children, title, description }: { children: React.ReactNode; title?: string; description?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = React.useState<AdminUser | null>(null);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({ daily: true, finance: true });

  React.useEffect(() => {
    let active = true;
    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error("UNAUTHORIZED");
        if (active) setUser(payload.data);
      })
      .catch(() => {
        if (active) router.replace("/admin-dashboard.html");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [router]);

  React.useEffect(() => {
    if (!user) return undefined;
    let active = true;
    async function loadUnread() {
      try {
        const response = await fetch(`${API_URL}/notifications?limit=1`, { credentials: "include" });
        const payload = await response.json().catch(() => null);
        if (active && response.ok && payload?.success) setUnreadCount(payload.meta?.unreadCount ?? 0);
      } catch {
        // Best-effort — a failed unread count must never block the dashboard.
      }
    }
    void loadUnread();
    const interval = setInterval(loadUnread, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/admin-dashboard.html");
  }

  const visibleGroups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || !user || (item.roles as readonly string[]).includes(user.role)),
  })).filter((group) => group.items.length > 0);

  function navigationContent(onNavigate?: () => void) {
    return visibleGroups.map((group) => {
      const hasActiveItem = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
      const expanded = expandedGroups[group.id] || hasActiveItem;
      return (
        <div key={group.id} className="border-b border-border/60 pb-2 last:border-0">
          <button type="button" className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-black text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-expanded={expanded} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !expanded }))}>
            {group.label}<ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded ? <div className="space-y-1 pt-1">{group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-4" />{item.label}</Link>;
          })}</div> : null}
        </div>
      );
    });
  }

  return (
    <div className="min-h-screen bg-section text-foreground" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 shadow-sm backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="فتح القائمة" className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </button>
            <Link href="/admin/operations" className="flex items-center gap-2 font-black text-primary">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">ن</span>
              <span className="hidden sm:inline">نسائم الحرمين</span>
            </Link>
            <span className="hidden border-r border-border pr-3 text-sm font-bold text-muted-foreground sm:inline">مركز التحكم</span>
          </div>
          <div className="flex items-center gap-3">
            {loading ? <span className="hidden text-xs text-muted-foreground sm:inline">جاري التحقق...</span> : null}
            {user ? <div className="hidden text-start sm:block"><p className="text-sm font-black">{user.fullName}</p><p className="text-xs text-muted-foreground">{roleLabels[user.role]}</p></div> : null}
            <Link href="/admin/notifications" className="relative inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:text-primary" aria-label="الإشعارات">
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -end-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <button type="button" className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:text-destructive" aria-label="تسجيل الخروج" onClick={() => void logout()}>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-72 shrink-0 border-l border-border bg-card p-4 lg:block">
          <nav className="space-y-2" aria-label="تنقل الإدارة">{navigationContent()}</nav>
          <div className="mt-6 rounded-2xl bg-primary/5 p-4 text-sm leading-7 text-muted-foreground"><p className="font-black text-foreground">تشغيل آمن</p><p className="mt-1">كل إجراء حساس يمر عبر صلاحيات الخادم وقواعد العمل الحالية.</p></div>
        </aside>
        {open ? <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-[min(20rem,88vw)] overflow-y-auto bg-card p-4 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><strong>مركز التحكم</strong><button type="button" aria-label="إغلاق القائمة" className="inline-flex size-9 items-center justify-center rounded-lg border border-border" onClick={() => setOpen(false)}><X className="size-4" /></button></div><nav className="space-y-2">{navigationContent(() => setOpen(false))}</nav></aside></div> : null}
        <main className="min-w-0 flex-1">
          {(title || description) ? <div className="border-b border-border bg-card px-4 py-7 sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl"><h1 className="text-2xl font-black sm:text-3xl">{title}</h1>{description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p> : null}</div></div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function roleLabel(role: AdminUser["role"]) { return roleLabels[role]; }

