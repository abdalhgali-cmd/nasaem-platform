// Public, deterministic helper; never handles personal data or fabricates availability.
export const GUIDE_CHOICES = Object.freeze([
  { key: "umrah", label: "أريد التقديم للعمرة", help: "الاطلاع على باقات العمرة المنشورة ومتطلباتها" },
  { key: "egypt", label: "أحتاج موافقة أمنية لمصر", help: "اختيار طريقة الدخول واستعراض المتطلبات" },
  { key: "tracking", label: "أريد متابعة طلب سابق", help: "متابعة الطلب من خلال نظام الوكالة" },
]);

export function guideService(catalog, key) {
  if (key !== "umrah" && key !== "egypt") return null;
  const items = [...(catalog?.services || []), ...(catalog?.visaTypes || [])];
  if (key === "umrah") {
    return items.find((item) => ["SVC-UMRAH", "VISA-UMRAH"].includes(String(item?.code || "").toUpperCase())) || null;
  }
  const approvedCodes = new Set(["VISA-EGYPT-CLEARANCE-AIR", "VISA-EGYPT-CLEARANCE-BORDER", "VISA-EGYPT-CLEARANCE", "SVC-EGYPT-CLEARANCE"]);
  return items.find((item) => approvedCodes.has(String(item?.code || "").toUpperCase())) || null;
}

export function guideOutcome(key, catalog) {
  if (key === "tracking") return { action: "track" };
  if (key !== "umrah" && key !== "egypt") return { action: "unknown" };
  const service = guideService(catalog, key);
  if (!service) return { action: "unavailable" };
  return { action: "service", service };
}
