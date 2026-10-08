// The one place the app keeps the agency's identity and contact details.
// Defaults are the agency's own published details (same values as the web
// site's web/src/lib/site-config.ts); staff can override the contact fields
// from the back-office Settings (CONTACT_PHONE, CONTACT_EMAIL, CONTACT_ADDRESS,
// WHATSAPP_NUMBER), served by GET /settings/public.
import { loadPublicSettings } from "./catalog.js";

export const AGENCY = Object.freeze({
  name: "نسائم الحرمين للسفر والسياحة",
  shortName: "نسائم الحرمين",
  tagline: "رحلتك تبدأ معنا بثقة",
  description:
    "وكالة سفر وسياحة متكاملة لخدمات العمرة والتأشيرات وحجوزات الطيران والفنادق — نُنجز رحلتك بثقة واحترافية من البداية حتى العودة.",
  mission:
    "نساعدك على تقديم طلبات السفر والتأشيرات والعمرة ومتابعتها من خلال مسار واضح وتواصل مباشر.",
  phone: "+249 91 103 4372",
  whatsapp: "249911034372",
  email: "Nasaem.alHaramain2024@gmail.com",
  address: "كسلا، شرق الموقف العام، مقابل مخابز باتسري، بجوار استديو جميل",
  city: "كسلا",
  website: "https://nasaem-alharamain.com",
});

// Service lines offered (labels only; the live catalog decides what can be
// requested in the app).
export const AGENCY_SERVICES = Object.freeze([
  { icon: "umrah", label: "العمرة" },
  { icon: "flight", label: "تذاكر الطيران" },
  { icon: "visa", label: "التأشيرات" },
  { icon: "shield-check", label: "الموافقات الأمنية" },
  { icon: "ferry", label: "الرحلات البحرية" },
  { icon: "hotel", label: "الفنادق" },
]);

// How the agency works with a customer (the web "من نحن" page's own steps).
export const AGENCY_WORKFLOW = Object.freeze([
  { title: "تقديم الطلب", description: "أرسل بيانات الخدمة أو الوجهة والمعلومات اللازمة لمراجعة أولية." },
  { title: "مراجعة التوفر", description: "يتحقق الفريق من التفاصيل والتوفر قبل إعداد عرض مناسب للحالة." },
  { title: "العرض والتأكيد", description: "يصلك العرض أو التحديث عبر قنوات التواصل، ثم تحدد الإجراء التالي." },
  { title: "المتابعة والتسليم", description: "تستمر المتابعة حتى إكمال المعالجة وتسليم المستندات أو النتائج المتاحة." },
]);

export const AGENCY_VALUES = Object.freeze([
  { icon: "shield-check", title: "وضوح الإجراءات", description: "نوضح الخطوات والمستندات والتكلفة المنشورة قبل بدء الطلب." },
  { icon: "check-circle", title: "مراجعة دقيقة", description: "يراجع الفريق تفاصيل الطلب والتوفر قبل تقديم عرض أو متابعة الإجراء." },
  { icon: "phone", title: "تواصل مباشر", description: "يمكنك متابعة طلبك والتواصل مع فريق الدعم عبر القنوات المتاحة." },
  { icon: "clock", title: "تنظيم المتابعة", description: "يظهر لكل طلب مرجع وحالة وخطوة تالية كلما توفرت معلومات جديدة." },
]);

export function mergeAgencySettings(settings = {}) {
  const pick = (key, fallback) => (typeof settings[key] === "string" && settings[key].trim() ? settings[key].trim() : fallback);
  return {
    ...AGENCY,
    phone: pick("CONTACT_PHONE", AGENCY.phone),
    email: pick("CONTACT_EMAIL", AGENCY.email),
    address: pick("CONTACT_ADDRESS", AGENCY.address),
    whatsapp: pick("WHATSAPP_NUMBER", AGENCY.whatsapp).replace(/\D/g, ""),
  };
}

let cached = null;
// Contact details with the back-office overrides applied; never fails (the
// published defaults are used offline).
export async function loadAgency() {
  if (cached) return cached;
  try {
    cached = mergeAgencySettings(await loadPublicSettings());
  } catch {
    return { ...AGENCY };
  }
  return cached;
}

export function whatsappLink(number, text = "") {
  const digits = String(number || "").replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function telLink(phone) {
  return `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;
}
