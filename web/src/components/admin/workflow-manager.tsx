"use client";

import * as React from "react";
import { ArrowDown, CheckCircle2, LockKeyhole, Workflow } from "lucide-react";

const stages = [
  { key: "NEW", label: "طلب جديد", note: "استقبال الطلب والتحقق الأولي" },
  { key: "UNDER_REVIEW", label: "قيد المراجعة", note: "مراجعة البيانات والمستندات" },
  { key: "WAITING_CUSTOMER", label: "بانتظار العميل", note: "إجراء أو مستند مطلوب من العميل" },
  { key: "PAYMENT_PENDING", label: "بانتظار الدفع", note: "إرسال العرض أو الفاتورة" },
  { key: "PROCESSING", label: "قيد التنفيذ", note: "تنفيذ الخدمة" },
  { key: "COMPLETED", label: "مكتمل", note: "تسليم النتيجة وإغلاق الطلب" },
];

export function WorkflowManager() {
  const [selected, setSelected] = React.useState(stages[0].key);
  const current = stages.find((stage) => stage.key === selected) || stages[0];
  return <section className="mx-auto max-w-6xl space-y-5 px-4 py-7 sm:px-6 lg:px-10"><div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Workflow className="size-5" /></div><div><h2 className="text-xl font-black">سير العمل</h2><p className="mt-1 text-sm leading-7 text-muted-foreground">هذه خريطة تشغيلية للحالات المدعومة. لا توجد حاليًا واجهة لتعديل انتقالات الحالات؛ ذلك مقصود حتى لا يستطيع أي مستخدم إنشاء انتقال غير صالح أو تجاوز invariant خادمي.</p></div></div></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"><LockKeyhole className="me-2 inline size-4" />التحكم في الحالة يتم عبر <strong>OrderStatusHistory</strong> و<strong>updateOrderStatus</strong> في backend. أي واجهة تعديل مستقبلية يجب أن تمر عبر نفس القواعد وتُراجع قبل تفعيلها.</div><div className="grid gap-4 md:grid-cols-[1fr_1.1fr]"><div className="rounded-3xl border border-border bg-card p-5 shadow-sm">{stages.map((stage, index) => <React.Fragment key={stage.key}><button type="button" onClick={() => setSelected(stage.key)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-start ${selected === stage.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className="flex size-9 items-center justify-center rounded-full border border-current/30 text-xs font-black">{index + 1}</span><span><strong className="block text-sm">{stage.label}</strong><small className="opacity-75">{stage.key}</small></span>{stage.key === "COMPLETED" ? <CheckCircle2 className="ms-auto size-4" /> : null}</button>{index < stages.length - 1 ? <ArrowDown className="mx-auto my-1 size-4 text-muted-foreground" /> : null}</React.Fragment>)}</div><div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7"><p className="text-xs font-bold text-muted-foreground">الحالة المحددة</p><h3 className="mt-2 text-2xl font-black">{current.label}</h3><p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{current.key}</p><p className="mt-6 rounded-2xl bg-muted/50 p-4 text-sm leading-7">{current.note}</p><div className="mt-5 flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="size-4" />تطبيق الانتقال يخضع لقواعد الخادم</div></div></div></section>;
}
