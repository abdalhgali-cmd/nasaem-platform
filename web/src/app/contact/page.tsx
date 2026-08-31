import type { Metadata } from "next";
import { PageHero } from "@/components/sections/page-hero";
import { ContactMap } from "@/components/sections/contact-map";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  path: "/contact",
  title: "تواصل معنا",
  description:
    "تواصل مع فريق نسائم الحرمين للسفر والسياحة عبر الهاتف، البريد الإلكتروني، الواتساب، أو زُرنا في أحد فروعنا.",
});

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="تواصل معنا"
        breadcrumb="تواصل معنا"
        title="نحن هنا لمساعدتك في كل خطوة"
        description="فريقنا متاح للإجابة على استفساراتك وترتيب رحلتك بأفضل شكل ممكن."
      />
      <ContactMap />
    </>
  );
}
