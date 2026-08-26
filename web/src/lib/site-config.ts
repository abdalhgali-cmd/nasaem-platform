export const siteConfig = {
  name: "نسائم الحرمين للسفر والسياحة",
  nameEn: "Nasaem Al-Haramain Travel & Tourism",
  shortName: "نسائم الحرمين",
  description:
    "وكالة سفر وسياحة متكاملة لخدمات العمرة والتأشيرات وحجوزات الطيران والفنادق — نُنجز رحلتك بثقة واحترافية من البداية حتى العودة.",
  url: "https://www.nasaem-alharamain.com",
  phone: "+249 91 103 4372",
  whatsapp: "249911034372",
  email: "Nasaem.alHaramain2024@gmail.com",
  address: "كسلا، شرق الموقف العام، مقابل مخابز باتسري، بجوار استديو جميل",
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
  { label: "التأشيرات", href: "/visas" },
  { label: "الطيران", href: "/flights" },
  { label: "العبارات", href: "/ferries" },
  { label: "الفنادق", href: "/hotels" },
  { label: "الباقات", href: "/packages" },
  { label: "من نحن", href: "/about" },
  { label: "تواصل معنا", href: "/contact" },
  { label: "تتبع الطلب", href: "/track" },
  { label: "حسابي", href: "/account" },
];
