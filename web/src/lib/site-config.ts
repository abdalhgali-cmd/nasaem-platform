export const siteConfig = {
  name: "نسائم الحرمين للسفر والسياحة",
  nameEn: "Nasaem Al-Haramain Travel & Tourism",
  shortName: "نسائم الحرمين",
  description:
    "وكالة سفر وسياحة متكاملة لخدمات العمرة والتأشيرات وحجوزات الطيران والفنادق — نُنجز رحلتك بثقة واحترافية من البداية حتى العودة.",
  url: "https://www.nasaem-alharamain.com",
  // Placeholder contact details — replace with the real business numbers
  // before shipping to production.
  phone: "+249 900 000 000",
  whatsapp: "249900000000",
  email: "info@nasaem-alharamain.com",
  address: "شارع النيل، الخرطوم، السودان",
  branches: ["الخرطوم", "بورتسودان", "جدة"],
  social: {
    facebook: "https://facebook.com/nasaemalharamain",
    instagram: "https://instagram.com/nasaemalharamain",
    twitter: "https://x.com/nasaemalharamain",
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
  { label: "الفنادق", href: "/hotels" },
  { label: "الباقات", href: "/packages" },
  { label: "من نحن", href: "/about" },
  { label: "تواصل معنا", href: "/contact" },
];
