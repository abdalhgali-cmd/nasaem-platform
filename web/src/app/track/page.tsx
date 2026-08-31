import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { TrackingPanel } from "@/components/sections/tracking-panel";
import { EgyptClearanceTravelFollowup } from "@/components/sections/egypt-clearance-travel-followup";
import { PaymentAccountsPanel } from "@/components/sections/payment-accounts-panel";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  path: "/track",
  title: "تتبع طلبك",
  description:
    "تتبع حالة طلبك لدى نسائم الحرمين للسفر والسياحة عبر التحقق من رقم هاتفك.",
});

export default function TrackPage() {
  return (
    <>
      <PageHero
        eyebrow="تتبع الطلب"
        breadcrumb="تتبع الطلب"
        title="تابع حالة طلبك بسهولة"
        description="أدخل رقم هاتفك للتحقق عبر واتساب ومتابعة حالة طلبك خطوة بخطوة."
      />
      <section className="py-24">
        <Container>
          <TrackingPanel />
          <EgyptClearanceTravelFollowup />
        </Container>
      </section>
      <PaymentAccountsPanel />
    </>
  );
}
