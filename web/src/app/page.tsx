import { Hero } from "@/components/sections/hero";
import { Services } from "@/components/sections/services";
import { FeaturedUmrah } from "@/components/sections/featured-umrah";
import { HomeContactCta } from "@/components/sections/home-contact-cta";

export default function Home() {
  return (
    <>
      <Hero />
      <Services limit={6} showAllLink />
      <FeaturedUmrah />
      <HomeContactCta />
    </>
  );
}
