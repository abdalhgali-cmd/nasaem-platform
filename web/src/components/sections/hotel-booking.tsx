import Link from "next/link";
import { ArrowLeft, Hotel, MapPin } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger } from "@/components/motion/fade-in";

// No prices or ratings here: hotels are a request-a-quote flow (see
// HotelRequestClient/hotels page) — the team checks real availability and
// price for the requested dates before quoting the customer, so this
// teaser only lists destinations, never invented numbers.
const cities = [
  { city: "مكة المكرمة", note: "بجوار الحرم مباشرة" },
  { city: "المدينة المنورة", note: "على مقربة من المسجد النبوي" },
  { city: "جدة", note: "بالقرب من الواجهة البحرية" },
  { city: "القاهرة", note: "في قلب المدينة" },
];

export function HotelBooking() {
  return (
    <section className="bg-section py-24">
      <Container>
        <SectionHeading
          eyebrow="حجز الفنادق"
          title="إقامة مريحة أينما توجّهت"
          description="فنادق مختارة بعناية بالقرب من الحرمين الشريفين وكل الوجهات الرئيسية."
        />

        <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cities.map((item, index) => (
            <FadeIn key={item.city} delay={index * 0.06} className="h-full">
              <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl">
                <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-primary via-secondary to-primary">
                  <Hotel className="size-10 text-white/90" />
                  <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-bold text-foreground">{item.city}</h3>
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {item.note}
                  </p>
                  <p className="mt-4 text-xs font-bold text-primary">
                    اطلب عرض سعر حسب تواريخك
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </Stagger>

        <FadeIn className="mt-10 text-center">
          <Button asChild size="lg">
            <Link href="/hotels">
              تصفح كل الفنادق
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </FadeIn>
      </Container>
    </section>
  );
}
