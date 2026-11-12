import { Container } from "@/components/container";
import { HeroContent } from "@/components/sections/hero-content";
import { siteConfig } from "@/lib/site-config";
import { getPublicHomepage } from "@/lib/homepage";
import { getSiteAssetUrls } from "@/lib/site-assets";
import { getPublicCatalog } from "@/lib/services";

export async function Hero() {
  const [{ hero }, assetUrls, catalog] = await Promise.all([
    getPublicHomepage(),
    getSiteAssetUrls(),
    getPublicCatalog(),
  ]);
  const heroImageUrl = assetUrls["hero-image"];

  return (
    <section className="bg-brand-navy relative isolate overflow-hidden pb-16 pt-10 text-white sm:pb-20 sm:pt-14 lg:pb-24 lg:pt-20">
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-hosted, admin-replaceable, not in next.config's remotePatterns (same reasoning as logo.tsx).
        <img src={heroImageUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-20" />
      ) : null}
      <div aria-hidden className="bg-brand-dots absolute inset-0 -z-10" />
      {/* A single gold hairline closes the hero instead of a hard colour edge. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-accent/50 to-transparent" />

      <Container className="relative">
        <HeroContent
          title={hero.title ?? undefined}
          description={hero.description ?? undefined}
          ctaLabel={hero.ctaLabel ?? undefined}
          ctaTarget={hero.ctaTarget ?? undefined}
          whatsapp={siteConfig.whatsapp}
          catalog={catalog}
          defaultTitleNode={
            <>
              رحلتك تبدأ بطلب واضح،{" "}
              <span className="text-gold-shimmer">ونتابعها معك خطوة بخطوة</span>
            </>
          }
          defaultDescription={`${siteConfig.name}: اختر خدمتك، أرسل بياناتك ومستنداتك مرة واحدة، وراجع السعر قبل الدفع، ثم تابع حالة طلبك من هاتفك.`}
        />
      </Container>
    </section>
  );
}
