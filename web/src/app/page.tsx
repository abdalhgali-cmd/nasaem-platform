import { Hero } from "@/components/sections/hero";
import { Services } from "@/components/sections/services";
import { FeaturedUmrah } from "@/components/sections/featured-umrah";
import { FlightBooking } from "@/components/sections/flight-booking";
import { VisaServices } from "@/components/sections/visa-services";
import { HotelBooking } from "@/components/sections/hotel-booking";
import { Stats } from "@/components/sections/stats";
import { Testimonials } from "@/components/sections/testimonials";
import { Faq } from "@/components/sections/faq";
import { ContactMap } from "@/components/sections/contact-map";
import { getSiteAssetUrls } from "@/lib/site-assets";

export default async function Home() {
  const assetUrls = await getSiteAssetUrls();

  return (
    <>
      <Hero heroImageUrl={assetUrls["hero-background"]} />
      <Services />
      <FeaturedUmrah />
      <FlightBooking />
      <VisaServices />
      <HotelBooking />
      <Testimonials />
      <Stats />
      <Faq />
      <ContactMap />
    </>
  );
}
