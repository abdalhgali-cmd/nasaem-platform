"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgePercent,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  ClipboardList,
  FileText,
  Loader2,
  LogOut,
  Package,
  Tag,
  User,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerApi, customerUpload, CustomerApiError } from "@/lib/customer-api";
import { API_URL } from "@/lib/api-url";
import { siteConfig } from "@/lib/site-config";

type CustomerProfile = {
  id: string;
  customerNo: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  passportNo: string | null;
  nationality: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
};

type OrderService = { id: string; name: string; category: string };
type OrderItem = { id: string; quantity: number; unitPrice: string; total: string; service: OrderService };
type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  originalAmount: string | null;
  discountAmount: string | null;
  couponCode: string | null;
  currency: string;
  createdAt: string;
  items: OrderItem[];
};

type RequestDocument = { id: string; label: string; fileName: string; status: string; reviewNote: string | null; createdAt: string };
type RequestOffer = { id: string; carrier: string; description: string | null; amount: string; currency: string; createdAt: string };
type CustomerRequest = {
  id: string;
  requestNumber: string;
  service: { id: string; name: string; category: string } | null;
  visaType: { id: string; name: string; country: string } | null;
  status: string;
  outcome: string | null;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
  latestUpdateAt: string;
  nextAction: string;
  notes: string | null;
  invoice: { id: string; amount: string; currency: string; description: string | null; status: string; createdAt: string; decidedAt: string | null } | null;
  offers: RequestOffer[];
  selectedOfferId: string | null;
  documents: RequestDocument[];
  deliverables: { id: string; label: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }[];
  timeline?: { action: string; createdAt: string }[];
};

type CustomerNotification = { id: string; title: string; message: string; type: string; orderId: string | null; readAt: string | null; createdAt: string };

type Overview = {
  activeRequestsCount: number;
  activeOrdersCount: number;
  recentOrders: OrderSummary[];
  documentsCount: number;
  ordersNeedingAttention: number;
  availableCouponsCount: number;
  latestUpdateAt: string | null;
};

type DocumentSummary = {
  id: string;
  type: string;
  fileName: string;
  createdAt: string;
  order: { orderNumber: string } | null;
};

type CouponSummary = {
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  expiryDate: string | null;
  minOrderAmount: number | null;
  service: { id: string; name: string } | null;
  visaType: { id: string; name: string } | null;
};

type CouponLists = { available: CouponSummary[]; used: CouponSummary[]; expired: CouponSummary[] };

type PublicService = { id: string; name: string; category: string; basePrice: string; currency: string };

const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: "طلب جديد",
  UNDER_REVIEW: "قيد المراجعة",
  WAITING_DOCUMENTS: "بانتظار المستندات",
  PAYMENT_PENDING: "بانتظار الدفع",
  PROCESSING: "جاري التنفيذ",
  APPROVED: "تمت الموافقة",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض",
  CANCELLED: "ملغي",
};

const TABS = [
  { key: "overview", label: "نظرة عامة", icon: ClipboardList },
  { key: "orders", label: "طلباتي", icon: Package },
  { key: "requests", label: "طلباتي العامة", icon: FileText },
  { key: "notifications", label: "الإشعارات", icon: Bell },
  { key: "payments", label: "المدفوعات", icon: BadgePercent },
  { key: "offers", label: "العروض", icon: Tag },
  { key: "deliverables", label: "الملفات النهائية", icon: FileText },
  { key: "documents", label: "المستندات", icon: FileText },
  { key: "coupons", label: "الكوبونات", icon: Tag },
  { key: "profile", label: "الملف الشخصي", icon: User },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type SummaryMode = "payments" | "offers" | "deliverables";
type SummaryRow = { key: string; title: string; detail: string; href: string | null };

function formatMoney(amount: string | number | null, currency: string) {
  if (amount === null) return "-";
  return `${Number(amount).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function AccountDashboard() {
  const router = useRouter();
  const [profile, setProfile] = React.useState<CustomerProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<TabKey>("overview");

  const loadProfile = React.useCallback(async () => {
    try {
      const data = await customerApi<CustomerProfile>("/customer-auth/me");
      setProfile(data);
    } catch {
      router.replace("/account/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleLogout() {
    try {
      await customerApi("/customer-auth/logout", { method: "POST" });
    } catch {
      // best-effort — still leave the page
    }
    router.replace("/account/login");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <p className="text-sm text-muted-foreground">مرحبًا بك</p>
          <h2 className="text-lg font-bold text-foreground">{profile.fullName}</h2>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout} type="button">
          <LogOut className="size-4" />
          تسجيل الخروج
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="أقسام الحساب"
        className="flex flex-wrap gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab onGoToTab={setTab} /> : null}
      {tab === "orders" ? <OrdersTab /> : null}
      {tab === "requests" ? <RequestsTab /> : null}
      {tab === "notifications" ? <NotificationsTab /> : null}
      {tab === "payments" ? <CustomerDataSummaryTab mode="payments" /> : null}
      {tab === "offers" ? <CustomerDataSummaryTab mode="offers" /> : null}
      {tab === "deliverables" ? <CustomerDataSummaryTab mode="deliverables" /> : null}
      {tab === "documents" ? <DocumentsTab /> : null}
      {tab === "coupons" ? <CouponsTab /> : null}
      {tab === "profile" ? <ProfileTab profile={profile} onUpdated={setProfile} /> : null}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
      <p className="text-2xl font-extrabold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function OverviewTab({ onGoToTab }: { onGoToTab: (tab: TabKey) => void }) {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<Overview>("/customer/overview")
      .then(setOverview)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل البيانات"));
  }, []);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!overview) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="طلبات عامة نشطة" value={overview.activeRequestsCount} />
        <StatTile label="طلبات حساب نشطة" value={overview.activeOrdersCount} />
        <StatTile label="بحاجة لمتابعة" value={overview.ordersNeedingAttention} />
        <StatTile label="المستندات" value={overview.documentsCount} />
        <button type="button" onClick={() => onGoToTab("coupons")} className="contents">
          <StatTile label="كوبونات متاحة" value={overview.availableCouponsCount} />
        </button>
        <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">آخر تحديث: {formatDate(overview.latestUpdateAt)}</p>
      </div>

      <NewOrderPanel />

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-foreground">أحدث الطلبات</h3>
        {overview.recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد طلبات بعد.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {overview.recentOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function getOrderNextAction(order: OrderSummary) {
  if (order.status === "WAITING_DOCUMENTS") return "ارفع المستندات المطلوبة لإكمال طلبك.";
  if (order.status === "PAYMENT_PENDING" || order.paymentStatus === "AWAITING_TRANSFER") {
    return "أكمل الدفع عند ظهور تعليماته في طلبك.";
  }
  if (order.status === "REJECTED") return "راجع سبب الرفض وتواصل معنا إذا احتجت إلى مساعدة.";
  if (order.status === "CANCELLED") return "لا يوجد إجراء مطلوب منك حاليًا. يمكنك التواصل معنا عند الحاجة.";
  if (order.status === "COMPLETED") return "لا يوجد إجراء مطلوب منك حاليًا. طلبك مكتمل.";
  return "لا يوجد إجراء مطلوب منك حاليًا. سنخبرك عند الحاجة.";
}

function OrderCard({ order }: { order: OrderSummary }) {
  const [copied, setCopied] = React.useState(false);

  async function copyOrderNumber() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold text-foreground" dir="ltr">
            {order.orderNumber}
          </span>
          <button
            type="button"
            onClick={copyOrderNumber}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`نسخ رقم الطلب ${order.orderNumber}`}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            <span aria-live="polite">{copied ? "تم النسخ" : "نسخ"}</span>
          </button>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-secondary">
          {ORDER_STATUS_LABELS[order.status] || order.status}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
        <span className="font-bold">الخطوة التالية</span>
        <p className="mt-1 text-muted-foreground">{getOrderNextAction(order)}</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {order.items.map((item) => item.service.name).join("، ") || "طلب"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {order.discountAmount ? (
          <>
            <span className="text-muted-foreground line-through" dir="ltr">
              {formatMoney(order.originalAmount, order.currency)}
            </span>
            <span className="font-bold text-foreground" dir="ltr">
              {formatMoney(order.totalAmount, order.currency)}
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              كوبون {order.couponCode}
            </span>
          </>
        ) : (
          <span className="font-bold text-foreground" dir="ltr">
            {formatMoney(order.totalAmount, order.currency)}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" dir="ltr">
          {formatDate(order.createdAt)}
        </p>
        <a
          href={`https://wa.me/${siteConfig.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground outline-none transition hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MessageCircle className="size-4" />
          تواصل مع الدعم
        </a>
      </div>
    </li>
  );
}

// The "هل لديك كوبون خصم؟" flow: pick a service, optionally apply a
// coupon code (validated + priced server-side via /coupons/validate before
// the order is even created), then submit. The order itself is created via
// POST /customer/orders, which re-validates and re-applies the coupon
// server-side from scratch — this panel's preview is a convenience, never
// the source of truth for the final price.
function NewOrderPanel() {
  const [services, setServices] = React.useState<PublicService[]>([]);
  const [serviceId, setServiceId] = React.useState("");
  const [couponCode, setCouponCode] = React.useState("");
  const [preview, setPreview] = React.useState<{
    discountType: string;
    discountValue: number;
    discountAmount: number;
    finalAmount: number;
  } | null>(null);
  const [couponError, setCouponError] = React.useState<string | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<{ services: PublicService[] }>("/services/public")
      .then((data) => setServices(data.services))
      .catch(() => {});
  }, []);

  const selectedService = services.find((s) => s.id === serviceId) || null;

  async function handleApplyCoupon() {
    setCouponError(null);
    setPreview(null);
    if (!selectedService) {
      setCouponError("اختر الخدمة أولاً");
      return;
    }
    if (!couponCode.trim()) return;
    setValidating(true);
    try {
      const data = await customerApi<{
        discountType: string;
        discountValue: number;
        discountAmount: number;
        finalAmount: number;
      }>("/coupons/validate", {
        method: "POST",
        body: { code: couponCode.trim(), serviceId: selectedService.id, orderAmount: Number(selectedService.basePrice) },
      });
      setPreview(data);
    } catch (err) {
      setCouponError(err instanceof CustomerApiError ? err.message : "تعذر تطبيق الكوبون");
    } finally {
      setValidating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!selectedService) {
      setError("اختر الخدمة أولاً");
      return;
    }
    setSubmitting(true);
    try {
      const order = await customerApi<OrderSummary>("/customer/orders", {
        method: "POST",
        body: { serviceId: selectedService.id, couponCode: couponCode.trim() || undefined },
      });
      setResult(`تم إنشاء طلبك رقم ${order.orderNumber} بنجاح`);
      setCouponCode("");
      setPreview(null);
      setServiceId("");
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "تعذر إنشاء الطلب");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-1 text-sm font-bold text-foreground">طلب خدمة جديدة</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        هذا المسار ينشئ طلبًا داخل حسابك لمتابعته من لوحة العميل. إذا بدأت من نموذج الخدمة العام، فستتابع طلبك من صفحة التتبع.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-order-service" className="text-sm font-semibold text-foreground">
            الخدمة
          </label>
          <select
            id="new-order-service"
            required
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setPreview(null);
              setCouponError(null);
            }}
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          >
            <option value="">اختر الخدمة</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {formatMoney(s.basePrice, s.currency)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-background p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">هل لديك كوبون خصم؟</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              dir="ltr"
              placeholder="أدخل الكود"
              className="h-11 flex-1 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            />
            <Button type="button" variant="outline" onClick={handleApplyCoupon} disabled={validating || !couponCode.trim()}>
              {validating ? <Loader2 className="size-4 animate-spin" /> : <BadgePercent className="size-4" />}
              تطبيق
            </Button>
          </div>
          {couponError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{couponError}</p> : null}
          {preview ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                تم تطبيق الكوبون بنجاح — الخصم: {preview.discountType === "PERCENTAGE" ? `${preview.discountValue}%` : formatMoney(preview.discountValue, selectedService?.currency || "SAR")}
                {" "}(قيمة الخصم: {formatMoney(preview.discountAmount, selectedService?.currency || "SAR")}) — الإجمالي: {formatMoney(preview.finalAmount, selectedService?.currency || "SAR")}
              </span>
            </div>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {result ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            {result}
          </p>
        ) : null}

        <Button type="submit" variant="gold" disabled={submitting || !serviceId} className="self-start">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
        </Button>
      </form>
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = React.useState<OrderSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<OrderSummary[]>("/customer/orders")
      .then(setOrders)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل الطلبات"));
  }, []);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!orders) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد طلبات بعد.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PASSPORT: "جواز السفر",
  PHOTO: "صورة شخصية",
  VISA: "التأشيرة",
  TICKET: "تذكرة السفر",
  RECEIPT: "إيصال الدفع",
  OTHER: "أخرى",
};

function CustomerDataSummaryTab({ mode }: { mode: SummaryMode }) {
  const [requests, setRequests] = React.useState<CustomerRequest[] | null>(null);
  const [orders, setOrders] = React.useState<OrderSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { Promise.all([customerApi<CustomerRequest[]>("/customer/requests"), customerApi<OrderSummary[]>("/customer/orders")]).then(([requestData, orderData]) => { setRequests(requestData); setOrders(orderData); }).catch((err) => setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل البيانات")); }, []);
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!requests || !orders) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  const title = mode === "payments" ? "المدفوعات والفواتير" : mode === "offers" ? "العروض المتاحة" : "الملفات النهائية";
  const empty = mode === "payments" ? "لا توجد مدفوعات أو فواتير بعد." : mode === "offers" ? "لا توجد عروض مرتبطة بطلباتك بعد." : "لا توجد ملفات نهائية متاحة بعد.";
  const rows: SummaryRow[] = requests.flatMap<SummaryRow>((request) => {
    if (mode === "payments") {
      return request.invoice ? [{ key: request.invoice.id, title: request.service?.name || "فاتورة طلب", detail: `${formatMoney(request.invoice.amount, request.invoice.currency)} — ${request.invoice.status}`, href: null }] : [];
    }
    if (mode === "offers") {
      return request.offers.map((offer) => ({ key: offer.id, title: `${offer.carrier} — ${request.service?.name || "طلب"}`, detail: `${formatMoney(offer.amount, offer.currency)}${offer.description ? ` — ${offer.description}` : ""}`, href: null }));
    }
    return request.deliverables.map((file) => ({ key: file.id, title: file.label || file.fileName, detail: request.service?.name || "طلب خدمة", href: `${API_URL}/customer/requests/${encodeURIComponent(request.id)}/deliverables/${encodeURIComponent(file.id)}/file` }));
  });
  const orderRows: SummaryRow[] = mode === "payments" ? orders.map((order) => ({ key: order.id, title: order.orderNumber, detail: `${formatMoney(order.totalAmount, order.currency)} — ${order.paymentStatus}`, href: null })) : [];
  const allRows = [...rows, ...orderRows];
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h3 className="text-sm font-bold text-foreground">{title}</h3>{allRows.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{empty}</p> : <div className="mt-4 grid gap-3">{allRows.map((row) => row.href ? <a key={row.key} href={row.href} className="rounded-xl border border-border bg-background p-4 text-sm text-primary hover:underline">{row.title}<span className="mt-1 block text-xs text-muted-foreground">{row.detail}</span></a> : <div key={row.key} className="rounded-xl border border-border bg-background p-4 text-sm"><span className="font-semibold text-foreground">{row.title}</span><span className="mt-1 block text-xs text-muted-foreground">{row.detail}</span></div>)}</div>}</div>;
}

function NotificationsTab() {
  const [notifications, setNotifications] = React.useState<CustomerNotification[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    try { setNotifications(await customerApi<CustomerNotification[]>("/customer/notifications")); }
    catch (err) { setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل الإشعارات"); }
  }
  React.useEffect(() => { load(); }, []);
  async function markRead(id: string) {
    try { await customerApi(`/customer/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }); setNotifications((items) => items?.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) || null); }
    catch { /* keep current state */ }
  }
  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!notifications) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  if (!notifications.length) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">لا توجد إشعارات جديدة.</div>;
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-3">{notifications.map((notification) => <button key={notification.id} type="button" onClick={() => !notification.readAt && markRead(notification.id)} className={`rounded-xl border p-4 text-start outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${notification.readAt ? "border-border bg-background" : "border-primary/30 bg-primary/5"}`}><div className="flex items-center justify-between gap-3"><span className="font-bold text-foreground">{notification.title}</span><span className="text-xs text-muted-foreground" dir="ltr">{formatDate(notification.createdAt)}</span></div><p className="mt-2 text-sm text-muted-foreground">{notification.message}</p>{notification.readAt ? null : <span className="mt-2 inline-block text-xs font-semibold text-primary">اضغط لتحديده كمقروء</span>}</button>)}</div></div>;
}

function RequestsTab() {
  const [requests, setRequests] = React.useState<CustomerRequest[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<CustomerRequest | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    customerApi<CustomerRequest[]>("/customer/requests")
      .then(setRequests)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل الطلبات"));
  }, []);

  async function openRequest(id: string) {
    setSelectedId(id);
    try {
      setDetail(await customerApi<CustomerRequest>(`/customer/requests/${encodeURIComponent(id)}`));
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل تفاصيل الطلب");
    }
  }

  async function uploadDocument(requestId: string, file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("label", file.name);
      form.append("file", file);
      await customerUpload(`/customer/requests/${encodeURIComponent(requestId)}/documents`, form);
      await openRequest(requestId);
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "تعذر رفع المستند");
    } finally { setUploading(false); }
  }

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!requests) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-primary" /></div>;
  if (requests.length === 0) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">لا توجد طلبات عامة مرتبطة بحسابك بعد. الطلبات التي بدأت من نموذج الخدمة العام ستظهر هنا بعد تسجيل الدخول.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-bold text-foreground">طلباتي العامة</h3>
        <p className="mt-1 text-xs text-muted-foreground">هذه الطلبات منفصلة عن طلبات الحساب، ويمكنك متابعة تفاصيلها من هنا أو عبر التتبع العام.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {requests.map((request) => (
          <button key={request.id} type="button" onClick={() => openRequest(request.id)} className="rounded-2xl border border-border bg-card p-5 text-start shadow-sm outline-none transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-primary" dir="ltr">{request.requestNumber}</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{request.status}</span>
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">{request.service?.name || "طلب خدمة"}</p>
            <p className="mt-1 text-xs text-muted-foreground">آخر تحديث: {formatDate(request.latestUpdateAt)}</p>
            <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-foreground"><strong>الخطوة التالية:</strong> {request.nextAction}</div>
          </button>
        ))}
      </div>
      {selectedId && detail ? (
        <div className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs text-muted-foreground">تفاصيل الطلب</p><h3 className="text-lg font-bold text-foreground">{detail.service?.name || "طلب خدمة"}</h3></div>
            <span className="text-sm font-bold text-primary" dir="ltr">{detail.requestNumber}</span>
          </div>
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm"><strong>الخطوة التالية:</strong><p className="mt-1 text-muted-foreground">{detail.nextAction}</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">الحالة</p><p className="mt-1 font-semibold">{detail.status}</p><p className="mt-2 text-xs text-muted-foreground">الدفع: {detail.paymentStatus}</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">تاريخ الإنشاء</p><p className="mt-1 font-semibold">{formatDate(detail.createdAt)}</p><p className="mt-2 text-xs text-muted-foreground">آخر تحديث: {formatDate(detail.updatedAt)}</p></div>
          </div>
          {detail.notes ? <p className="mt-4 rounded-xl bg-background p-4 text-sm text-muted-foreground">{detail.notes}</p> : null}
          {detail.invoice ? <div className="mt-4 rounded-xl border border-border p-4 text-sm"><p className="font-bold">الفاتورة</p><p className="mt-2">{formatMoney(detail.invoice.amount, detail.invoice.currency)} — {detail.invoice.status}</p></div> : null}
          {detail.offers.length ? <div className="mt-4 rounded-xl border border-border p-4"><p className="font-bold">العروض</p><div className="mt-3 grid gap-2">{detail.offers.map((offer) => <div key={offer.id} className="rounded-lg bg-background p-3 text-sm"><div className="flex justify-between gap-2"><span>{offer.carrier}</span><strong dir="ltr">{formatMoney(offer.amount, offer.currency)}</strong></div>{offer.description ? <p className="mt-1 text-xs text-muted-foreground">{offer.description}</p> : null}</div>)}</div></div> : null}
          <div className="mt-4 rounded-xl border border-border p-4"><p className="font-bold">المستندات</p>{detail.documents.length ? <div className="mt-3 grid gap-2">{detail.documents.map((doc) => <div key={doc.id} className="rounded-lg bg-background p-3 text-sm"><div className="flex justify-between gap-2"><span>{doc.label || doc.fileName}</span><span className="text-xs text-muted-foreground">{doc.status}</span></div>{doc.reviewNote ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{doc.reviewNote}</p> : null}</div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">لم تُرفع مستندات بعد.</p>}<label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">{uploading ? "جارٍ الرفع..." : "رفع أو إعادة رفع مستند"}<input type="file" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadDocument(detail.id, file); event.currentTarget.value = ""; }} /></label></div>
          {detail.deliverables.length ? <div className="mt-4 rounded-xl border border-border p-4"><p className="font-bold">الملفات النهائية</p><div className="mt-3 grid gap-2">{detail.deliverables.map((file) => <a key={file.id} href={`${API_URL}/customer/requests/${encodeURIComponent(detail.id)}/deliverables/${encodeURIComponent(file.id)}/file`} className="rounded-lg bg-background p-3 text-sm text-primary hover:underline">{file.label || file.fileName}</a>)}</div></div> : null}
          {detail.timeline?.length ? <div className="mt-4 rounded-xl border border-border p-4"><p className="font-bold">الخط الزمني</p><ol className="mt-3 flex flex-col gap-2">{detail.timeline.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="flex justify-between gap-3 text-xs"><span>{entry.action}</span><span className="text-muted-foreground" dir="ltr">{formatDate(entry.createdAt)}</span></li>)}</ol></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function DocumentsTab() {
  const [documents, setDocuments] = React.useState<DocumentSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<DocumentSummary[]>("/customer/documents")
      .then(setDocuments)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل المستندات"));
  }, []);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!documents) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مستندات مرفوعة بعد.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{DOCUMENT_TYPE_LABELS[doc.type] || doc.type}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.order ? `طلب ${doc.order.orderNumber}` : ""} · {formatDate(doc.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CouponBadgeValue(coupon: CouponSummary) {
  return coupon.discountType === "PERCENTAGE" ? `${coupon.discountValue}%` : `${coupon.discountValue}`;
}

function CouponCard({ coupon, muted }: { coupon: CouponSummary; muted?: boolean }) {
  return (
    <li className={`rounded-xl border border-border bg-background p-4 ${muted ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-foreground" dir="ltr">
          {coupon.code}
        </span>
        <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent-foreground">
          خصم {CouponBadgeValue(coupon)}
        </span>
      </div>
      {coupon.description ? <p className="mt-1 text-sm text-muted-foreground">{coupon.description}</p> : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {coupon.service ? <span>الخدمة: {coupon.service.name}</span> : null}
        {coupon.visaType ? <span>الفئة: {coupon.visaType.name}</span> : null}
        {coupon.minOrderAmount ? <span>الحد الأدنى: {coupon.minOrderAmount}</span> : null}
        {coupon.expiryDate ? <span>الانتهاء: {formatDate(coupon.expiryDate)}</span> : null}
      </div>
    </li>
  );
}

function CouponsTab() {
  const [coupons, setCoupons] = React.useState<CouponLists | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<CouponLists>("/customer/coupons")
      .then(setCoupons)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "تعذر تحميل الكوبونات"));
  }, []);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!coupons) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-foreground">كوبونات متاحة</h3>
        {coupons.available.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد كوبونات متاحة حاليًا.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {coupons.available.map((c) => (
              <CouponCard key={c.code} coupon={c} />
            ))}
          </ul>
        )}
      </div>

      {coupons.used.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground">كوبونات مستخدمة</h3>
          <ul className="flex flex-col gap-3">
            {coupons.used.map((c) => (
              <CouponCard key={c.code} coupon={c} muted />
            ))}
          </ul>
        </div>
      ) : null}

      {coupons.expired.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-foreground">كوبونات منتهية</h3>
          <ul className="flex flex-col gap-3">
            {coupons.expired.map((c) => (
              <CouponCard key={c.code} coupon={c} muted />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const inputClass = "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary";

function ProfileTab({ profile, onUpdated }: { profile: CustomerProfile; onUpdated: (p: CustomerProfile) => void }) {
  const [fullName, setFullName] = React.useState(profile.fullName);
  const [email, setEmail] = React.useState(profile.email || "");
  const [country, setCountry] = React.useState(profile.country || "");
  const [city, setCity] = React.useState(profile.city || "");
  const [address, setAddress] = React.useState(profile.address || "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [passwordSaving, setPasswordSaving] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = React.useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const updated = await customerApi<CustomerProfile>("/customer-auth/profile", {
        method: "PATCH",
        body: { fullName, email, country, city, address },
      });
      onUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "تعذر حفظ البيانات");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaved(false);
    setPasswordSaving(true);
    try {
      await customerApi("/customer-auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof CustomerApiError ? err.message : "تعذر تغيير كلمة المرور");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={handleSaveProfile} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-bold text-foreground">البيانات الشخصية</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">رقم العميل</label>
          <input disabled value={profile.customerNo} dir="ltr" className={`${inputClass} opacity-60`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">الاسم الكامل</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">البريد الإلكتروني</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">الدولة</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">المدينة</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </div>
        {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        {saved ? <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">تم حفظ البيانات بنجاح</p> : null}
        <Button type="submit" variant="gold" disabled={saving} className="self-start">
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          حفظ التغييرات
        </Button>
      </form>

      <form onSubmit={handleChangePassword} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-bold text-foreground">تغيير كلمة المرور</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">كلمة المرور الحالية</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">كلمة المرور الجديدة</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        {passwordError ? <p className="text-xs text-red-600 dark:text-red-400">{passwordError}</p> : null}
        {passwordSaved ? <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">تم تغيير كلمة المرور بنجاح</p> : null}
        <Button type="submit" variant="outline" disabled={passwordSaving} className="self-start">
          {passwordSaving ? <Loader2 className="size-4 animate-spin" /> : null}
          تحديث كلمة المرور
        </Button>
      </form>
    </div>
  );
}
