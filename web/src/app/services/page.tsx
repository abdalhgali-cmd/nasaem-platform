import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { Services } from "@/components/sections/services";

export const metadata: Metadata = {
  title: "جميع الخدمات | نسائم الحرمين",
  description: "استعرض خدمات السفر والسياحة والتأشيرات والحجوزات المتاحة لدى نسائم الحرمين.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="خدماتنا"
        title="اختر الخدمة المناسبة لرحلتك"
        description="كل خدماتنا في صفحة واحدة، مع مسار واضح لبدء الطلب ومتابعته."
        breadcrumb="جميع الخدمات"
      />
      <Services />
    </>
  );
}
