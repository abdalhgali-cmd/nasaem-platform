import type { AdminUser } from "@/components/admin/admin-shell";

type Role = AdminUser["role"];

// Screens of the old back-office that are not rebuilt yet. They open INSIDE
// the unified admin (/admin/tools/<key>): an iframe of the existing page in
// its embedded mode (backend/public/assets/api.js), so their workflows and
// server rules are exactly the ones already in use. Roles mirror the old
// dashboard's ROLE_TABS / management rules; the API enforces them either way.
export type AdminTool = {
  key: string;
  label: string;
  description: string;
  roles: readonly Role[];
  // Old page and the part of it to show; `id` (a record to open) is appended
  // as the old #/<tab>/<id> route when the tool has `tab`.
  page: string;
  tab?: string;
  params?: Record<string, string>;
};

const MANAGERS = ["SUPER_ADMIN", "ADMIN"] as const;
const CASE_ROLES = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "ACCOUNTANT"] as const;

export const ADMIN_TOOLS: readonly AdminTool[] = [
  { key: "orders", label: "الحجوزات والطلبات السابقة", description: "طلبات نظام الحجز السابق: الحالة والإسناد والدفعات وتفاصيل كل طلب.", roles: CASE_ROLES, page: "/admin-dashboard.html", tab: "orders" },
  { key: "customers", label: "العملاء", description: "ملفات العملاء وطلباتهم ومراجعة الربط بالجواز.", roles: CASE_ROLES, page: "/admin-dashboard.html", tab: "customers" },
  { key: "flights", label: "حجوزات الطيران", description: "متابعة طلبات حجز الطيران حتى إصدار التذكرة.", roles: CASE_ROLES, page: "/admin-dashboard.html", tab: "flights" },
  { key: "payments", label: "سجل الدفعات", description: "كل الدفعات المسجلة وحالاتها.", roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"], page: "/admin-dashboard.html", tab: "payments" },
  { key: "new-order", label: "طلب جديد (مكتب)", description: "إدخال طلب لعميل من المكتب.", roles: ["SUPER_ADMIN", "ADMIN", "EMPLOYEE"], page: "/request.html" },
  { key: "egypt-settings", label: "أسعار مصر وتنبيهاتها", description: "سعر الجوي والبري وتفعيلهما وسعر الدولار، ومواعيد التنبيهات.", roles: MANAGERS, page: "/admin-dashboard.html", tab: "egypt", params: { only: "egypt-settings" } },
  { key: "payment-accounts", label: "حسابات الدفع", description: "الحسابات التي يُعرض على العميل التحويل إليها.", roles: MANAGERS, page: "/admin-dashboard.html", tab: "management", params: { mgmt: "payment-accounts" } },
  { key: "offers", label: "العروض", description: "العروض الترويجية على الخدمات.", roles: MANAGERS, page: "/admin-dashboard.html", tab: "management", params: { mgmt: "offers" } },
  { key: "coupons", label: "الكوبونات", description: "كوبونات الخصم واستخدامها.", roles: MANAGERS, page: "/admin-dashboard.html", tab: "management", params: { mgmt: "coupons" } },
  { key: "branches", label: "الفروع", description: "فروع الوكالة.", roles: MANAGERS, page: "/admin-dashboard.html", tab: "management", params: { mgmt: "branches" } },
  { key: "suppliers", label: "الموردون", description: "موردو الخدمات.", roles: MANAGERS, page: "/admin-dashboard.html", tab: "management", params: { mgmt: "suppliers" } },
  { key: "flight-inventory", label: "رحلات الطيران وأسعار الصرف", description: "الرحلات المدخلة يدويًا وأسعار الصرف.", roles: MANAGERS, page: "/flight-management.html" },
  { key: "airlines", label: "شركات الطيران", description: "شركات الطيران المعروفة للنظام.", roles: [...MANAGERS, "CONTENT_MANAGER"], page: "/admin-dashboard.html", tab: "management", params: { mgmt: "airlines" } },
  { key: "airports", label: "المطارات", description: "المطارات المعروفة للنظام.", roles: [...MANAGERS, "CONTENT_MANAGER"], page: "/admin-dashboard.html", tab: "management", params: { mgmt: "airports" } },
  { key: "ferries", label: "العبارات", description: "شركات الملاحة ومواعيد الرحلات البحرية.", roles: [...MANAGERS, "CONTENT_MANAGER"], page: "/admin-dashboard.html", tab: "management", params: { mgmt: "ferries" } },
];

export function adminTool(key: string) {
  return ADMIN_TOOLS.find((tool) => tool.key === key) || null;
}

export function canUseTool(tool: AdminTool, role: Role | undefined) {
  return Boolean(role) && (tool.roles as readonly string[]).includes(role as string);
}

// Only an id of a plain record shape is passed on to the old page.
const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function toolFrameSrc(tool: AdminTool, id?: string | null) {
  const query = new URLSearchParams({ embed: "1", ...(tool.params || {}) });
  const record = id && RECORD_ID.test(id) && tool.tab && ["orders", "customers", "flights"].includes(tool.tab) ? `/${encodeURIComponent(id)}` : "";
  return `${tool.page}?${query.toString()}${tool.tab ? `#/${tool.tab}${record}` : ""}`;
}
