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
  ChevronLeft,
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
  Moon,
  Plane,
  Users,
  UserRoundCog,
  X,
  Contact,
  ShoppingBag,
  PlaneTakeoff,
  FilePlus2,
  Receipt,
  Wallet,
  Landmark,
  BadgePercent,
  Ticket,
  LayoutTemplate,
  MapPin,
  Ship,
  Building2,
  Truck,
} from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { TestDataNotice } from "@/components/layout/test-data-notice";
import { adminTool } from "@/components/admin/tools/admin-tools";

export type AdminUser = {
  id: string;
  fullName: string;
  email?: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE" | "ACCOUNTANT" | "CONTENT_MANAGER";
};

type Role = AdminUser["role"];
type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; roles?: readonly Role[] };

const MANAGERS = ["SUPER_ADMIN", "ADMIN"] as const;
const toolItem = (key: string, icon: NavItem["icon"]): NavItem => {
  const tool = adminTool(key);
  if (!tool) throw new Error(`unknown admin tool ${key}`);
  return { href: `/admin/tools/${tool.key}`, label: tool.label, icon, roles: tool.roles };
};

// The one staff navigation (owner decision 2026-11-01). Each item's roles
// mirror the backend routes it uses: hiding an item is only a convenience,
// the API refuses the data to any other role. Items without roles are open to
// every staff role.
export const navigationGroups: readonly { id: string; label: string; items: readonly NavItem[] }[] = [
  { id: "daily", label: "العمل اليومي", items: [
    { href: "/admin", label: "مركز العمليات", icon: Gauge },
    // Same roles as the backend Egypt endpoints (EGYPT_WORK in contact-requests.routes.js).
    { href: "/admin/egypt", label: "الموافقة الأمنية لمصر", icon: Plane, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
    // ACCOUNTANT reads requests (GET /contact-requests) for the payment
    // context, read-only; the other roles work them.
    { href: "/admin/umrah", label: "طلبات العمرة", icon: Moon, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"] },
    // The per-case workspace, for the roles that actually work cases.
    { href: "/admin/cases", label: "مساحة عمل الحالات", icon: ClipboardList, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
    { href: "/admin/notifications", label: "الإشعارات", icon: Bell },
    { href: "/admin/assignments", label: "الإسناد", icon: UserRoundCog, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
    { href: "/admin/documents", label: "المستندات", icon: FileCheck2, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"] },
  ] },
  { id: "records", label: "العملاء والسجلات", items: [
    toolItem("customers", Contact),
    toolItem("orders", ShoppingBag),
    toolItem("flights", PlaneTakeoff),
    toolItem("new-order", FilePlus2),
  ] },
  { id: "finance", label: "المال والتقارير", items: [
    { href: "/admin/payment-review", label: "مراجعة الدفعات", icon: CreditCard, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    toolItem("payments", Receipt),
    toolItem("payment-accounts", Wallet),
    { href: "/admin/reports", label: "التقارير", icon: BarChart3, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    { href: "/admin/approvals", label: "الموافقات", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
    // Development test values (TestDataNotice): configurable here, never fixed in code.
    { href: "/admin/pricing", label: "الأسعار والباقات", icon: Settings2, roles: MANAGERS },
    toolItem("egypt-settings", Landmark),
  ] },
  { id: "services", label: "الخدمات والموقع", items: [
    { href: "/admin/services", label: "الخدمات", icon: BriefcaseBusiness, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
    { href: "/admin/visas", label: "التأشيرات والمتطلبات", icon: Layers3, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
    { href: "/admin/umrah/groups", label: "مجموعات العمرة", icon: Sparkles, roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"] },
    toolItem("offers", BadgePercent),
    toolItem("coupons", Ticket),
    { href: "/admin/content", label: "محتوى الرئيسية", icon: LayoutTemplate, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
    { href: "/admin/appearance", label: "المظهر", icon: Palette, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
    { href: "/admin/media", label: "الوسائط", icon: ImageIcon, roles: ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER"] },
  ] },
  { id: "transport", label: "الطيران والنقل", items: [
    toolItem("flight-inventory", Plane),
    toolItem("airlines", PlaneTakeoff),
    toolItem("airports", MapPin),
    toolItem("ferries", Ship),
  ] },
  { id: "system", label: "الفريق والنظام", items: [
    { href: "/admin/users", label: "المستخدمون", icon: Users, roles: MANAGERS },
    { href: "/admin/roles", label: "الأدوار والصلاحيات", icon: ShieldCheck, roles: MANAGERS },
    toolItem("branches", Building2),
    toolItem("suppliers", Truck),
    { href: "/admin/features", label: "الخصائص", icon: Flag, roles: MANAGERS },
    { href: "/admin/settings", label: "إعدادات الموقع", icon: Settings2, roles: MANAGERS },
    { href: "/admin/activity", label: "سجل النشاط", icon: Activity, roles: MANAGERS },
  ] },
];

// Same-site /admin paths only: a crafted ?next= can never leave the admin.
export function safeAdminNext(next: string | null | undefined) {
  const value = String(next || "");
  if (!/^\/admin(?:[/?#]|$)/.test(value) || value.startsWith("/admin/login") || value.includes("\\") || value.includes("//")) return "/admin";
  return value;
}

export function adminLoginHref(pathname: string, search = "") {
  const here = `${pathname}${search}`;
  return here === "/admin" || here.startsWith("/admin/login") ? "/admin/login" : `/admin/login?next=${encodeURIComponent(here)}`;
}

const AdminUserContext = React.createContext<AdminUser | null>(null);

// The signed-in staff member, for pages inside the shell (null while loading).
export function useAdminUser() {
  return React.useContext(AdminUserContext);
}

const roleLabels: Record<AdminUser["role"], string> = {
  SUPER_ADMIN: "المدير الأعلى",
  ADMIN: "مدير النظام",
  EMPLOYEE: "موظف عمليات",
  ACCOUNTANT: "المحاسب",
  CONTENT_MANAGER: "مدير المحتوى",
};

// The old back-office screens embedded in /admin/tools/* (same origin) read
// the API address from here, so they always call the same API as the admin
// around them, on any host (backend/public/assets/api.js, website copy).
declare global {
  interface Window { __NASAEM_API_URL__?: string }
}
if (typeof window !== "undefined") window.__NASAEM_API_URL__ = API_URL;

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
        if (active) router.replace(adminLoginHref(window.location.pathname, window.location.search));
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
    router.replace("/admin/login");
  }

  const visibleGroups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || !user || item.roles.includes(user.role)),
  })).filter((group) => group.items.length > 0);

  // The most specific matching item is the active one (/admin/umrah/groups
  // is «مجموعات العمرة», not also «طلبات العمرة»).
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeHref = visibleGroups.flatMap((group) => group.items.map((item) => item.href)).filter((href) => href === "/admin" ? pathname === "/admin" : matches(href)).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  // Breadcrumb: the group and item for the current page, when the page is in
  // the navigation (a few task pages such as /admin/delivery are not).
  const activeGroup = visibleGroups.find((group) => group.items.some((item) => isActive(item.href)));
  const activeItem = activeGroup?.items.find((item) => isActive(item.href));

  function navigationContent(onNavigate?: () => void) {
    return visibleGroups.map((group) => {
      const hasActiveItem = group.items.some((item) => isActive(item.href));
      const expanded = expandedGroups[group.id] || hasActiveItem;
      return (
        <div key={group.id} className="border-b border-[var(--nh-sidebar-line)] py-2 last:border-0">
          <button type="button" className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11.5px] font-bold text-[var(--nh-sidebar-ink-muted)] transition hover:text-[var(--nh-sidebar-ink)]" aria-expanded={expanded} onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !expanded }))}>
            {group.label}<ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded ? <div className="space-y-0.5 pt-1">{group.items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-semibold transition ${active ? "bg-[var(--nh-sidebar-active)] text-[var(--nh-sidebar-ink)] before:absolute before:inset-y-2.5 before:-start-3 before:w-[3px] before:rounded-e-full before:bg-[var(--nh-gold-500)]" : "text-[var(--nh-sidebar-ink-muted)] hover:bg-[var(--nh-sidebar-hover)] hover:text-[var(--nh-sidebar-ink)]"}`}
              >
                <Icon className={`size-4 shrink-0 ${active ? "text-[var(--nh-gold-500)]" : ""}`} strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}</div> : null}
        </div>
      );
    });
  }

  const brand = (
    <Link href="/admin" className="block rounded-lg px-2 pb-4 pt-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, fixed size */}
      <img src="/brand/admin-logo-on-navy.png" alt="نسائم الحرمين للسفر والسياحة" width={216} height={79} className="h-auto w-[216px] max-w-full" />
      <span className="mt-2 block text-[11.5px] font-bold text-[var(--nh-gold-300)]">مركز التحكم</span>
    </Link>
  );

  const safeOpsNote = (
    <div className="rounded-xl border border-[var(--nh-sidebar-line)] p-3 text-[12.5px] leading-6 text-[var(--nh-sidebar-ink-muted)]">
      <p className="font-bold text-[var(--nh-sidebar-ink)]">تشغيل آمن</p>
      <p className="mt-1">كل إجراء حساس يمر عبر صلاحيات الخادم وقواعد العمل الحالية.</p>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-section text-foreground" dir="rtl">
      <aside className="nh-admin-rail sticky top-0 hidden h-screen w-68 shrink-0 flex-col overflow-y-auto bg-[var(--nh-sidebar-bg)] px-3 py-4 lg:flex">
        <div className="border-b border-[var(--nh-sidebar-line)]">{brand}</div>
        <nav className="flex-1 pt-1" aria-label="تنقل الإدارة">{navigationContent()}</nav>
        <div className="mt-4 space-y-3">
          {safeOpsNote}
          {user ? (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--nh-sidebar-line)] p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--nh-gold-100)] text-sm font-bold text-[var(--nh-gold-700)]" aria-hidden="true">{user.fullName.trim().charAt(0)}</span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[var(--nh-sidebar-ink)]">{user.fullName}</p>
                <p className="text-xs text-[var(--nh-sidebar-ink-muted)]">{roleLabels[user.role]}</p>
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-card">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" aria-label="فتح القائمة" className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-border bg-background lg:hidden" onClick={() => setOpen(true)}>
                <Menu className="size-5" />
              </button>
              <Link href="/admin" className="flex shrink-0 items-center gap-2 lg:hidden" aria-label="نسائم الحرمين — مركز التحكم">
                {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, fixed size */}
                <img src="/brand/admin-emblem.png" alt="" width={36} height={33} className="h-8 w-auto" />
              </Link>
              <nav aria-label="المسار" className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
                <span className="shrink-0">مركز التحكم</span>
                {activeGroup ? <><ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" /><span className="shrink-0">{activeGroup.label}</span></> : null}
                {activeItem ? <><ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" /><strong className="truncate font-bold text-foreground" aria-current="page">{activeItem.label}</strong></> : null}
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {loading ? <span className="hidden text-xs text-muted-foreground sm:inline">جاري التحقق...</span> : null}
              <Link href="/admin/notifications" className="relative inline-flex size-10 items-center justify-center rounded-[10px] border border-border bg-background text-muted-foreground transition hover:text-primary" aria-label="الإشعارات">
                <Bell className="size-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -top-1.5 -end-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-card">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
              {user ? (
                <div className="hidden items-center gap-3 border-s border-border ps-3 sm:flex">
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--nh-gold-100)] text-sm font-bold text-[var(--nh-gold-700)]" aria-hidden="true">{user.fullName.trim().charAt(0)}</span>
                  <div className="text-start">
                    <p className="text-[13px] font-bold leading-5">{user.fullName}</p>
                    <p className="text-xs leading-4 text-muted-foreground">{roleLabels[user.role]}</p>
                  </div>
                </div>
              ) : null}
              <button type="button" className="inline-flex size-10 items-center justify-center rounded-[10px] border border-border bg-background text-muted-foreground transition hover:text-destructive" aria-label="تسجيل الخروج" onClick={() => void logout()}>
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>

        {open ? (
          <div className="fixed inset-0 z-50 bg-[rgba(16,19,58,0.55)] lg:hidden" onClick={() => setOpen(false)}>
            <aside className="nh-admin-rail flex h-full w-[min(20rem,88vw)] flex-col overflow-y-auto bg-[var(--nh-sidebar-bg)] px-3 py-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-2 border-b border-[var(--nh-sidebar-line)]">
                {brand}
                <button type="button" aria-label="إغلاق القائمة" className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--nh-sidebar-line)] text-[var(--nh-sidebar-ink)]" onClick={() => setOpen(false)}><X className="size-4" /></button>
              </div>
              <nav className="pt-1" aria-label="تنقل الإدارة">{navigationContent(() => setOpen(false))}</nav>
              <div className="mt-4">{safeOpsNote}</div>
            </aside>
          </div>
        ) : null}

        <main className="min-w-0 flex-1">
          <TestDataNotice audience="staff" />
          {(title || description) ? <div className="border-b border-border bg-card px-4 py-7 sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl"><h1 className="text-2xl font-extrabold leading-9 sm:text-[26px]">{title}</h1>{description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p> : null}</div></div> : null}
          <AdminUserContext.Provider value={user}>{children}</AdminUserContext.Provider>
        </main>
      </div>
    </div>
  );
}

export function roleLabel(role: AdminUser["role"]) { return roleLabels[role]; }

