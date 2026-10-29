export const siteConfig = {
  name: "نسائم الحرمين للسفر والسياحة",
  nameEn: "Nasaem Al-Haramain Travel & Tourism",
  shortName: "نسائم الحرمين",
  description:
    "ابدأ طلب العمرة أو الموافقة الأمنية لمصر، وتابع حالة طلبك مباشرة مع نسائم الحرمين دون إنشاء حساب.",
  url: "https://nasaem-alharamain.com",
  phone: "+249 91 103 4372",
  whatsapp: "249911034372",
  email: "Nasaem.alHaramain2024@gmail.com",
  address: "كسلا، شرق الموقف العام، مقابل حلويات باتيسري، بجوار استديو جميل",
  branches: ["كسلا"],
  social: {
    facebook: "",
    instagram: "",
    twitter: "",
  },
} as const;

export type NavItem = {
  label: string;
  href: string;
};

export const mainNav: NavItem[] = [
  { label: "الرئيسية", href: "/" },
  { label: "العمرة", href: "/umrah" },
  { label: "الموافقة الأمنية لمصر", href: "/visas/egypt-security-approval" },
  { label: "تتبع الطلب", href: "/track" },
  { label: "تواصل معنا", href: "/contact" },
];
