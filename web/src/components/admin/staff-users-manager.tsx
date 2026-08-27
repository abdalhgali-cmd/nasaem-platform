"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial data loading synchronizes with the API. */

import * as React from "react";
import { Check, Loader2, Plus, Search, UserPlus } from "lucide-react";
import { API_URL } from "@/lib/api-url";
import { roleLabel, type AdminUser } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";

type StaffUser = AdminUser & { employeeNo: string; phone?: string | null; status: "ACTIVE" | "INACTIVE" | "SUSPENDED"; branchId?: string | null; createdAt: string };
const roles: AdminUser["role"][] = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"];
const statusLabels = { ACTIVE: "نشط", INACTIVE: "غير نشط", SUSPENDED: "موقوف" } as const;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر إتمام العملية");
  return payload;
}

export function StaffUsersManager() {
  const [users, setUsers] = React.useState<StaffUser[]>([]);
  const [actorRole, setActorRole] = React.useState<AdminUser["role"] | null>(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ fullName: "", email: "", phone: "", password: "", role: "EMPLOYEE" as AdminUser["role"] });

  async function load() {
    setLoading(true); setError("");
    try { const [payload, mePayload] = await Promise.all([request("/users"), request("/auth/me")]); setUsers(payload.data || []); setActorRole(mePayload.data?.role || null); } catch (err) { setError(err instanceof Error ? err.message : "تعذر تحميل المستخدمين"); } finally { setLoading(false); }
  }
  React.useEffect(() => { void load(); }, []);

  async function updateUser(id: string, field: "role" | "status", value: string) {
    setWorking(`${field}-${id}`); setError(""); setSuccess("");
    try { const payload = await request(`/users/${encodeURIComponent(id)}/${field}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) }); setUsers((current) => current.map((user) => user.id === id ? payload.data : user)); setSuccess("تم حفظ التغيير وتسجيله في سجل النشاط"); } catch (err) { setError(err instanceof Error ? err.message : "تعذر حفظ التغيير"); } finally { setWorking(null); }
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking("create"); setError(""); setSuccess("");
    try { const payload = await request("/users", { method: "POST", body: JSON.stringify(form) }); setUsers((current) => [payload.data, ...current]); setForm({ fullName: "", email: "", phone: "", password: "", role: "EMPLOYEE" }); setShowCreate(false); setSuccess("تم إنشاء حساب الموظف"); } catch (err) { setError(err instanceof Error ? err.message : "تعذر إنشاء الموظف"); } finally { setWorking(null); }
  }

  const filtered = users.filter((user) => [user.fullName, user.email || "", user.employeeNo, user.phone || "", roleLabel(user.role)].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())));

  const canManageRoles = actorRole === "SUPER_ADMIN";
  return <section className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6 lg:px-10">
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7"><div><p className="text-xs font-bold text-muted-foreground">إدارة الوصول إلى النظام</p><h2 className="mt-1 text-xl font-black">المستخدمون والموظفون</h2><p className="mt-2 text-sm text-muted-foreground">إدارة الحسابات دون عرض كلمات المرور أو أي بيانات سرية.</p></div>{canManageRoles ? <Button type="button" variant="gold" onClick={() => setShowCreate((value) => !value)}><UserPlus className="size-4" />موظف جديد</Button> : null}</div>
    {error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">{error}</div> : null}
    {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><Check className="me-2 inline size-4" />{success}</div> : null}
    {showCreate && canManageRoles ? <form onSubmit={createUser} className="grid gap-4 rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-bold">الاسم الكامل<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="text-sm font-bold">البريد الإلكتروني<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="text-sm font-bold">الهاتف<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="text-sm font-bold">كلمة المرور المؤقتة<input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" /></label><label className="text-sm font-bold">الدور<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AdminUser["role"] })} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal">{roles.filter((role) => role !== "SUPER_ADMIN").map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label><div className="flex items-end gap-2"><Button type="submit" disabled={working === "create"}>{working === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}حفظ الموظف</Button><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button></div></form> : null}
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="relative max-w-xl"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو البريد أو الرقم الوظيفي" className="h-11 w-full rounded-xl border border-border bg-background ps-10 pe-3 text-sm outline-none focus:border-primary" /></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-border text-start text-xs text-muted-foreground"><th className="px-3 py-3 text-start">الموظف</th><th className="px-3 py-3 text-start">البريد</th><th className="px-3 py-3 text-start">الدور</th><th className="px-3 py-3 text-start">الحالة</th><th className="px-3 py-3 text-start">إجراء</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">جاري تحميل المستخدمين...</td></tr> : null}{!loading && filtered.length === 0 ? <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">لا توجد نتائج.</td></tr> : null}{filtered.map((user) => <tr key={user.id} className="border-b border-border/70 last:border-0"><td className="px-3 py-4"><p className="font-black">{user.fullName}</p><p className="font-mono text-xs text-muted-foreground" dir="ltr">{user.employeeNo}</p></td><td className="px-3 py-4 text-muted-foreground" dir="ltr">{user.email}</td><td className="px-3 py-4">{canManageRoles ? <select value={user.role} disabled={working === `role-${user.id}`} onChange={(e) => void updateUser(user.id, "role", e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold">{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select> : <span className="text-xs font-bold">{roleLabel(user.role)}</span>}</td><td className="px-3 py-4"><select value={user.status} disabled={working === `status-${user.id}`} onChange={(e) => void updateUser(user.id, "status", e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-bold">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="px-3 py-4 text-xs text-muted-foreground">{working?.endsWith(user.id) ? <Loader2 className="size-4 animate-spin" /> : "تُحفظ التغييرات فورًا"}</td></tr>)}</tbody></table></div></div>
  </section>;
}
