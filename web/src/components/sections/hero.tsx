import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
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
  // The agency's own logo for dark surfaces (same source as the header's).
  const logoUrl = assetUrls["logo-dark"] || "/logo-dark.png";

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#082b6b] via-primary to-[#0a2f70] pb-24 pt-12 text-white sm:pt-20">
      {heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- backend-hosted, admin-replaceable, not in next.config's remotePatterns (same reasoning as logo.tsx).
        <img src={heroImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-25" />
      ) : (
        <GradientBackdrop variant="dark" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(212,175,55,0.18),transparent_45%),radial-gradient(circle_at_85%_30%,rgba(30,136,229,0.25),transparent_50%)]"
      />
      {/* A faint grid, fading out toward the bottom — texture without imagery. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
      />

      <Container className="relative flex flex-col items-center">
        <HeroContent
          title={hero.title ?? undefined}
          description={hero.description ?? undefined}
          ctaLabel={hero.ctaLabel ?? undefined}
          ctaTarget={hero.ctaTarget ?? undefined}
          whatsapp={siteConfig.whatsapp}
          catalog={catalog}
          logoUrl={logoUrl}
          defaultTitleNode={
            <>
              نُنجز رحلتك بثقة —{" "}
              <span className="text-gold-shimmer">عمرة، تأشيرات، وسفر</span>{" "}
              دون تعقيد
            </>
          }
          defaultDescription={`${siteConfig.name} تساعدك في تنظيم تفاصيل رحلتك: باقات العمرة، خدمات التأشيرات، وحجوزات الطيران والفنادق — مع توضيح الخطوات ومتابعة الطلب حتى اكتماله.`}
        />
      </Container>
    </section>
  );
}
