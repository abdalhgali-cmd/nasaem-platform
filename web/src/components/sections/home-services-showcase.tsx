import Link from "next/link";
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
  const byCategory = (needle: string) => services.filter((item) => item.category.toLowerCase().includes(needle)).length;
  const cards: ShowcaseService[] = [
    {
      key: "umrah",
      title: "العمرة",
      description: "تأشيرة فقط، أو عمرة بالخدمات جواً أو بحراً.",
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
    {
      key: "visas",
      title: "التأشيرات",
      description: "اختر وجهتك واطّلع على المتطلبات.",
      href: "/visas",
      count: visaTypes.filter((item) => !isEgypt(item) && item.code !== "VISA-UMRAH").length,
    },
    {
      key: "flights",
      title: "حجوزات الطيران",
      description: "أرسل رحلتك المطلوبة، ويؤكد فريقنا التوفر والسعر قبل أي دفع.",
      href: "/flights",
      count: byCategory("flight"),
    },
    {
      key: "ferries",
      title: "الرحلات البحرية",
      description: "حجز البواخر بين السودان والسعودية مع متابعة الطلب.",
      href: "/ferries",
      count: byCategory("ferry"),
    },
    {
      key: "hotels",
      title: "الفنادق",
      description: "طلب حجز فندقي يؤكده فريقنا مع الفندق.",
      href: "/hotels",
      count: byCategory("hotel"),
    },
    {
      key: "packages",
      title: "الباقات والعروض",
      description: "تعرّف على باقات السفر المتاحة.",
      href: "/packages",
      count: packages.filter((item) => !isUmrah(item)).length,
    },
  ];
  return cards.filter((card) => card.count > 0);
}

export async function HomeServicesShowcase() {
  const cards = showcaseServices(await getPublicCatalog());

  return (
    <section id="services" className="scroll-mt-24 py-10 sm:py-14" aria-labelledby="home-services-title">
      <Container>
        <span id="start-request" className="block scroll-mt-24" aria-hidden="true" />
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-extrabold text-primary dark:text-secondary">خدماتنا</p>
          <h2 id="home-services-title" className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            كيف نساعدك؟
          </h2>
        </div>
        {cards.length > 0 ? <ServiceShowcaseCards cards={cards} /> : (
          <p className="mt-6 text-center text-muted-foreground" role="status">
            لا توجد خدمات معروضة حالياً. <Link href="/services" className="font-bold text-primary underline">أعد عرض الخدمات</Link> أو <Link href="/contact" className="font-bold text-primary underline">تواصل معنا</Link>.
          </p>
        )}
      </Container>
    </section>
  );
}
