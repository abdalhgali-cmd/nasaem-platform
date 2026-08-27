"use client";

import * as React from "react";
import { Info, ShieldCheck } from "lucide-react";

const matrix = [
  { label: "الإدارة العليا", role: "SUPER_ADMIN", capabilities: "كامل النظام، إنشاء الموظفين، تغيير الأدوار، الحذف المقيّد" },
  { label: "مدير النظام", role: "ADMIN", capabilities: "التشغيل، الطلبات، العملاء، المدفوعات، وإدارة المحتوى دون تغيير الأدوار" },
  { label: "موظف العمليات", role: "EMPLOYEE", capabilities: "عرض الطلبات وتنفيذ انتقالات التشغيل والإسناد ومجموعات العمرة" },
  { label: "المحاسب", role: "ACCOUNTANT", capabilities: "عرض الطلبات والتكاليف والتقارير ومراجعة المدفوعات" },
  { label: "مدير المحتوى", role: "CONTENT_MANAGER", capabilities: "الخدمات والتأشيرات والمتطلبات والصفحة الرئيسية والمظهر دون العمليات المالية" },
] as const;

const guardrails = [
  "كل مسار API يطبق requireAuth وrequireRole في الخادم؛ إخفاء الرابط في الواجهة ليس حاجزًا أمنيًا.",
  "مدير المحتوى لا يملك مسارات تأكيد أو رفض المدفوعات ولا مسارات الطلبات التشغيلية.",
  "المحاسب لا يحصل تلقائيًا على صلاحيات إدارة المحتوى.",
  "تغيير الأدوار مقصور على SUPER_ADMIN، مع منع خفض دور الحساب الحالي وحماية آخر مدير أعلى نشط.",
];

export function RolesPermissions() {
  const [selected, setSelected] = React.useState("SUPER_ADMIN");
  const current = matrix.find((item) => item.role === selected) || matrix[0];
  return <section className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6 lg:px-10">
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div><div><h2 className="text-xl font-black">الأدوار والصلاحيات</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">هذه الصفحة تعرض نموذج RBAC الموجود فعليًا في الخادم. لا يوجد جدول صلاحيات مستقل بعد، لذلك لا نعرض مفاتيح وهمية ولا نسمح بتجاوز route guards.</p></div></div></div>
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]"><div className="rounded-3xl border border-border bg-card p-4 shadow-sm"><p className="mb-3 px-2 text-xs font-black text-muted-foreground">الأدوار الحالية</p>{matrix.map((item) => <button type="button" key={item.role} onClick={() => setSelected(item.role)} className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-start text-sm font-bold ${selected === item.role ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><span>{item.label}</span><span dir="ltr" className="text-[10px] opacity-75">{item.role}</span></button>)}</div><div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><h3 className="text-lg font-black">{current.label}</h3><p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{current.role}</p><p className="mt-5 rounded-2xl bg-primary/5 p-4 text-sm leading-7">{current.capabilities}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{["عرض البيانات المسموح بها", "إدارة الحالات ضمن قواعد العمل", "تسجيل التغييرات الحساسة", "رفض الطلبات غير المصرح بها"].map((item) => <div key={item} className="rounded-xl border border-border p-3 text-sm font-bold"><span className="me-2 text-emerald-600">✓</span>{item}</div>)}</div></div></div>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900"><Info className="me-2 inline size-4" /><strong>حدود معلنة:</strong> إنشاء permission matrix ديناميكية يحتاج migration وتحديث كل routes الموجودة. تم إبقاء النموذج الحالي صريحًا وآمنًا بدل إضافة واجهة تمنح صلاحيات لا ينفذها الخادم.</div>
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm"><h3 className="font-black">ضوابط الخادم</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{guardrails.map((item) => <p key={item} className="rounded-xl bg-muted/50 p-4 text-sm leading-7">{item}</p>)}</div></div>
  </section>;
}
