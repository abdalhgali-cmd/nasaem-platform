import Constants from "expo-constants";

// Agency contact details and legal-page links used by the Account screen.
// (Same values as web/src/lib/site-config.ts; kept in one place here.)
const webUrl = ((Constants.expoConfig?.extra?.webUrl as string | undefined) ?? "https://nasaem-alharamain.com").replace(/\/+$/, "");

export const agency = {
  name: "نسائم الحرمين للسفر والسياحة",
  phone: "+249911034372",
  phoneDisplay: "+249 91 103 4372",
  whatsapp: "249911034372",
  address: "كسلا — شرق الموقف العام — جوار استديو جميل",
};

export const legalLinks = [
  { label: "الشروط والأحكام", url: `${webUrl}/terms` },
  { label: "سياسة الخصوصية", url: `${webUrl}/privacy` },
  { label: "سياسة الاسترداد", url: `${webUrl}/refund` },
  { label: "سياسة الإلغاء", url: `${webUrl}/cancellation` },
];
