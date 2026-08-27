import { Hero } from "@/components/sections/hero";
import { Services } from "@/components/sections/services";
import { FeaturedUmrah } from "@/components/sections/featured-umrah";
import { FlightBooking } from "@/components/sections/flight-booking";
import { VisaServices } from "@/components/sections/visa-services";
import { HotelBooking } from "@/components/sections/hotel-booking";
import { Stats, type HighlightItem } from "@/components/sections/stats";
import { Testimonials } from "@/components/sections/testimonials";
import { Faq, type FaqItem } from "@/components/sections/faq";
import { ContactMap } from "@/components/sections/contact-map";
import { getPublicHomepage } from "@/lib/homepage";

export default async function Home() {
  const homepage = await getPublicHomepage();
  const faqItems: FaqItem[] = homepage.sections
    .filter((section) => section.key.toLowerCase().startsWith("faq:"))
    .filter((section) => section.title.trim() && section.description?.trim())
    .map((section) => ({
      id: section.id,
      question: section.title,
      answer: section.description!,
      sortOrder: section.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const highlightItems: HighlightItem[] = homepage.sections
    .filter((section) => section.key.toLowerCase().startsWith("stat:"))
    .filter((section) => section.title.trim() && section.description?.trim())
    .map((section) => ({ id: section.id, title: section.title, description: section.description!, sortOrder: section.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <Hero />
      <Services />
      <FeaturedUmrah />
      <FlightBooking />
      <VisaServices />
      <HotelBooking />
      <Testimonials />
      <Stats items={highlightItems} />
      <Faq items={faqItems} />
      <ContactMap />
    </>
  );
}
