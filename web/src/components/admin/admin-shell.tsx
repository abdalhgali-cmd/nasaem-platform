"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BriefcaseBusiness,
  ImageIcon,
  ClipboardCheck,
  ClipboardList,
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

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/admin-dashboard.html");
  }

  const visibleNavigation = navigation.filter((item) => !item.roles || !user || (item.roles as readonly string[]).includes(user.role));

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
            <button type="button" className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:text-destructive" aria-label="تسجيل الخروج" onClick={() => void logout()}>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="hidden w-72 shrink-0 border-l border-border bg-card p-4 lg:block">
          <nav className="space-y-1" aria-label="تنقل الإدارة">
            {visibleNavigation.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin/operations" && pathname.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-4" />{item.label}</Link>;
            })}
          </nav>
          <div className="mt-6 rounded-2xl bg-primary/5 p-4 text-sm leading-7 text-muted-foreground"><p className="font-black text-foreground">تشغيل آمن</p><p className="mt-1">كل إجراء حساس يمر عبر صلاحيات الخادم وقواعد العمل الحالية.</p></div>
        </aside>
        {open ? <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-[min(20rem,88vw)] overflow-y-auto bg-card p-4 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><strong>مركز التحكم</strong><button type="button" aria-label="إغلاق القائمة" className="inline-flex size-9 items-center justify-center rounded-lg border border-border" onClick={() => setOpen(false)}><X className="size-4" /></button></div><nav className="space-y-1">{visibleNavigation.map((item) => { const Icon = item.icon; const active = pathname === item.href || (item.href !== "/admin/operations" && pathname.startsWith(`${item.href}/`)); return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Icon className="size-4" />{item.label}</Link>; })}</nav></aside></div> : null}
        <main className="min-w-0 flex-1">
          {(title || description) ? <div className="border-b border-border bg-card px-4 py-7 sm:px-6 lg:px-10"><div className="mx-auto max-w-7xl"><h1 className="text-2xl font-black sm:text-3xl">{title}</h1>{description ? <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p> : null}</div></div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function roleLabel(role: AdminUser["role"]) { return roleLabels[role]; }

