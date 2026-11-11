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
    { key: "flights", title: "تذاكر الطيران", description: "حدّد خط الرحلة والمسافرين، ثم راجع العرض قبل اعتماد الحجز.", href: "/flights", count: services.filter(item => item.category === "flight").length },
    { key: "ferries", title: "حجز العبارات", description: "اختر المسار والتاريخ وعدد المسافرين لمراجعة التوفر.", href: "/ferries", count: services.filter(item => item.category === "ferry").length },
    { key: "hotels", title: "حجز الفنادق", description: "الوجهة والتواريخ والغرف، ثم عرض معتمد حسب التوفر.", href: "/hotels", count: services.filter(item => item.category === "hotel").length },
    { key: "visas", title: "التأشيرات والخدمات القنصلية", description: "الزيارة والعمل والتأشيرات الدولية ومتطلبات كل نوع.", href: "/visas", count: visaTypes.filter(item => !isEgypt(item) && item.category !== "UMRAH").length },
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
          <p className="text-sm font-extrabold text-primary dark:text-secondary">خدمات نسائم الحرمين</p>
          <h2 id="home-services-title" className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            اختر خدمتك وابدأ من المكان الصحيح
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            بيانات ومتطلبات واضحة، ومراجعة السعر قبل الدفع، ومتابعة من نفس الطلب.
          </p>
        </div>
        <ServiceShowcaseCards cards={cards} />
      </Container>
    </section>
  );
}
