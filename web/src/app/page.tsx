import { Hero } from "@/components/sections/hero";
import { HomeServicesShowcase } from "@/components/sections/home-services-showcase";
import { HomeHowItWorks } from "@/components/sections/home-how-it-works";
import { HomeContactCta } from "@/components/sections/home-contact-cta";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeServicesShowcase />
      <HomeHowItWorks />
      <HomeContactCta />
    </>
  );
}
