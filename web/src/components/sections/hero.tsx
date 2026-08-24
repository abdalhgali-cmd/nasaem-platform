import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
import { HeroContent } from "@/components/sections/hero-content";
import { siteConfig } from "@/lib/site-config";
import { getPublicHomepage } from "@/lib/homepage";
import { getSiteAssetUrls } from "@/lib/site-assets";

export async function Hero() {
  const [{ hero }, assetUrls] = await Promise.all([getPublicHomepage(), getSiteAssetUrls()]);
  const heroImageUrl = assetUrls["hero-image"];

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-primary via-primary to-[#0a2f70] pb-28 pt-16 text-white sm:pt-24">
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-hosted, admin-replaceable, not in next.config's remotePatterns (same reasoning as logo.tsx).
        <img src={heroImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
      ) : (
        <GradientBackdrop variant="dark" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.18),transparent_55%)]"
      />

      <Container className="relative flex flex-col items-center text-center">
        <HeroContent
          title={hero.title ?? undefined}
          description={hero.description ?? undefined}
          ctaLabel={hero.ctaLabel ?? undefined}
          ctaTarget={hero.ctaTarget ?? undefined}
          whatsapp={siteConfig.whatsapp}
          defaultTitleNode={
            <>
              نُنجز رحلتك بثقة —{" "}
              <span className="text-gold-shimmer">عمرة، تأشيرات، وسفر</span>{" "}
              دون تعقيد
            </>
          }
          defaultDescription={`${siteConfig.name} تتولى عنك كل التفاصيل: باقات عمرة متكاملة، تأشيرات سريعة، حجوزات طيران وفنادق بأفضل الأسعار — بخبرة تمتد لأكثر من عقد وفريق متاح على مدار الساعة.`}
        />
      </Container>
    </section>
  );
}
