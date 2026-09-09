import { Container } from "@/components/container";
import { GradientBackdrop } from "@/components/decorative/gradient-backdrop";
import { HeroContent } from "@/components/sections/hero-content";
import { siteConfig } from "@/lib/site-config";
import { getPublicHomepage } from "@/lib/homepage";
import { getSiteAssetUrls } from "@/lib/site-assets";
import Link from "next/link";
import { getPublicServices } from "@/lib/services";
import { resolveServiceHref } from "@/lib/service-routes";

const quickServiceCodes = ["SVC-UMRAH", "SVC-EGYPT-CLEARANCE", "SVC-FLIGHT", "SVC-FAMILY-VISIT", "SVC-FERRY", "SVC-HOTEL"];

export async function Hero() {
  const [{ hero }, assetUrls, services] = await Promise.all([getPublicHomepage(), getSiteAssetUrls(), getPublicServices()]);
  const quickServices = quickServiceCodes.flatMap((code) => {
    const service = services.find((item) => item.code === code);
    return service ? [service] : [];
  });
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
          servicePicker={
            <nav aria-label="اختر خدمتك" className="mx-auto max-w-3xl rounded-3xl border border-white/20 bg-white/10 p-5 sm:p-6">
              <h2 className="text-xl font-bold">كيف نقدر نساعدك؟</h2>
              <p className="mt-2 text-sm text-white/80">اختر خدمتك للاطلاع على التفاصيل والخطوات المطلوبة.</p>
              {quickServices.length > 0 ? (
                <div className="mt-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3">
                  {quickServices.map((service) => (
                    <Link key={service.id} href={resolveServiceHref(service)} className="flex min-h-14 items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-primary transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                      {service.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-5 text-sm text-white/80">يمكنك التواصل معنا لمساعدتك في اختيار الخدمة المناسبة.</p>
              )}
              <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-4 text-sm font-bold">
                <Link href="/#services" className="underline underline-offset-4">كل الخدمات</Link>
                <Link href="/track" className="underline underline-offset-4">عندك طلب؟ تابع طلبك</Link>
              </div>
            </nav>
          }
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
          defaultDescription={`${siteConfig.name} تساعدك في تنظيم تفاصيل رحلتك: باقات العمرة، خدمات التأشيرات، وحجوزات الطيران والفنادق — مع توضيح الخطوات ومتابعة الطلب حتى اكتماله.`}
        />
      </Container>
    </section>
  );
}
