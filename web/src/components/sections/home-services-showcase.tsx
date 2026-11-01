import { Container } from "@/components/container";
import { ServiceShowcaseCards, type ShowcaseService } from "@/components/sections/service-showcase-cards";
import { getPublicCatalog, type PublicCatalog } from "@/lib/services";

// The homepage's service cards. A card is shown only when the public catalog
// (the agency's back-office) currently publishes something for it: no
// service is advertised that cannot be requested, and no price is shown here
// (each page shows the agency's own price for the exact option chosen).
const isUmrah = (item: { category: string; code: string }) =>
  item.category === "UMRAH_PACKAGE" || item.code.startsWith("SVC-UMRAH");
const isEgypt = (item: { code: string }) => item.code.startsWith("VISA-EGYPT-CLEARANCE");

export function showcaseServices(catalog: PublicCatalog): ShowcaseService[] {
  const { services, visaTypes, packages } = catalog;
  const cards: ShowcaseService[] = [
    {
      key: "umrah",
      title: "العمرة",
      description: "باقات العمرة، بيانات المعتمرين ومستنداتهم، والدفع بالسعر المعتمد.",
      href: "/umrah",
      count: packages.filter(isUmrah).length + services.filter((item) => item.code === "SVC-UMRAH").length,
    },
    {
      key: "egypt",
      title: "الموافقة الأمنية لمصر",
      description: "جوي أو بري، ثم بيانات السفر عندما تحدد رحلتك.",
      href: "/visas/egypt-security-approval",
      count: visaTypes.filter(isEgypt).length,
    },
  ];
  return cards.filter((card) => card.count > 0);
}

export async function HomeServicesShowcase() {
  const cards = showcaseServices(await getPublicCatalog());
  if (cards.length === 0) return null;

  return (
    <section id="services" className="scroll-mt-24 py-20 sm:py-24" aria-labelledby="home-services-title">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-primary dark:text-secondary">خدمات الإصدار الأول</p>
          <h2 id="home-services-title" className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            خدمتان واضحتان من الطلب حتى المتابعة
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            اختر العمرة أو الموافقة الأمنية لمصر، ثم أكمل الطلب وتابع حالته دون إنشاء حساب.
          </p>
        </div>
        <ServiceShowcaseCards cards={cards} />
      </Container>
    </section>
  );
}
