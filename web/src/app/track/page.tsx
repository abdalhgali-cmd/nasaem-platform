import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { TrackRequestForm } from "@/components/sections/track-request-form";
import { FadeIn } from "@/components/motion/fade-in";
import { getSiteAssetUrls } from "@/lib/site-assets";

export const metadata: Metadata = {
  title: "تتبع طلبك",
  description: "تابع حالة طلباتك المُقدَّمة لنسائم الحرمين برقم هاتفك، وأكمل أي مستندات أو دفعات ناقصة.",
};

export default async function TrackPage() {
  const assetUrls = await getSiteAssetUrls();

  return (
    <>
      <PageHero
        eyebrow="تتبع طلبك"
        breadcrumb="تتبع طلبك"
        title="تابع حالة طلباتك بخطوة واحدة"
        description="أدخل رقم هاتفك لتصلك رسالة واتساب برمز دخول، ثم شاهد حالة كل طلباتك وأكمل أي مستند أو دفعة ناقصة."
        imageUrl={assetUrls["hero-background"]}
      />

      <section className="py-24">
        <Container className="max-w-2xl">
          <FadeIn>
            <TrackRequestForm />
          </FadeIn>
        </Container>
      </section>
    </>
  );
}
