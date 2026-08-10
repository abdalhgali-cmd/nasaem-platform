import type { Metadata } from "next";
import { Hotel, MapPin, ShieldCheck, Star, Wifi, Utensils, Car, Wind } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { BookingSearchWidget } from "@/components/sections/booking-search-widget";
import { ServiceRequestForm } from "@/components/sections/service-request-form";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { getSiteAssetUrls } from "@/lib/site-assets";
import { HOTEL_DESTINATIONS } from "@/lib/hotel-cities";

export const metadata: Metadata = {
  title: "حجز الفنادق",
  description:
    "احجز إقامتك في فنادق مختارة بعناية بالقرب من الحرمين الشريفين وفي كل الوجهات الرئيسية، بمستويات تناسب كل ميزانية.",
};

const cities = HOTEL_DESTINATIONS;

const amenities = [
  { icon: Wifi, label: "إنترنت لاسلكي مجاني" },
  { icon: Utensils, label: "إفطار متضمن" },
  { icon: Car, label: "خدمة نقل من وإلى المطار" },
  { icon: Wind, label: "تكييف مركزي" },
];

const hotelRequestFields = [
  { name: "city", label: "المدينة", type: "select" as const, options: cities.map((c) => c.city) },
  { name: "checkin", label: "تاريخ الدخول", type: "date" as const, required: true },
  { name: "checkout", label: "تاريخ الخروج", type: "date" as const, required: true },
  { name: "rooms", label: "عدد الغرف", type: "number" as const, min: 1, defaultValue: "1" },
  { name: "guests", label: "عدد النزلاء", type: "number" as const, min: 1, defaultValue: "1" },
];

export default async function HotelsPage() {
  const assetUrls = await getSiteAssetUrls();

  return (
    <>
      <PageHero
        eyebrow="حجز الفنادق"
        breadcrumb="الفنادق"
        title="إقامة مريحة أينما توجّهت"
        description="فنادق مختارة بعناية توفّر لك الراحة والقرب من الأماكن المهمة في كل وجهة."
        imageUrl={assetUrls["hero-background"]}
      />

      <section className="relative -mt-12 pb-8">
        <Container>
          <FadeIn className="flex justify-center">
            <BookingSearchWidget />
          </FadeIn>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <SectionHeading eyebrow="وجهات مقترحة" title="فنادق في أهم الوجهات" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((item, index) => (
              <FadeIn key={item.city} delay={index * 0.06}>
                <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl">
                  <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-primary via-secondary to-primary">
                    <Hotel className="size-11 text-white/90" />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-foreground">{item.city}</h3>
                      <span className="flex items-center gap-1 text-xs font-bold text-accent-foreground/80 dark:text-accent">
                        <Star className="size-3.5 fill-current" />
                        {item.rating}
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {item.note}
                    </p>
                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        <span className="text-[11px] text-muted-foreground">لليلة الواحدة من</span>
                        <p className="text-lg font-extrabold text-foreground">${item.price}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-24">
        <Container className="max-w-2xl">
          <SectionHeading
            eyebrow="اطلب حجزك"
            title="جاهز؟ اطلب حجز الفندق الآن"
            description="عبّئ بياناتك وسيتواصل معك فريقنا لتأكيد التوفر والأسعار."
          />
          <FadeIn className="mt-10">
            <ServiceRequestForm
              id="request"
              service="فندق"
              fields={hotelRequestFields}
              travelerNames={{ countField: "guests" }}
              searchParamMap={{ city: "city", checkin: "checkin", checkout: "checkout", guests: "guests" }}
            />
          </FadeIn>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="مميزات إقامتك" title="كل ما تحتاجه لإقامة مريحة" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {amenities.map((item, index) => (
              <FadeIn key={item.label} delay={index * 0.06}>
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <item.icon className="size-6" />
                  </span>
                  <span className="text-sm font-semibold text-foreground/85">{item.label}</span>
                </div>
              </FadeIn>
            ))}
          </Stagger>
          <FadeIn className="mt-10 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
            <ShieldCheck className="size-4 text-success" />
            جميع الفنادق مُختارة ومُراجعة بعناية لضمان جودة الإقامة
          </FadeIn>
        </Container>
      </section>
    </>
  );
}
