import Link from "next/link";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { getPublicSiteSettings } from "@/lib/public-settings";

export async function HomeContactCta() {
  const settings = await getPublicSiteSettings();
  const phoneHref = `tel:${settings.phone.replace(/\s/g, "")}`;
  const whatsappHref = `https://wa.me/${settings.phone.replace(/\D/g, "")}`;

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="bg-brand-navy relative isolate overflow-hidden rounded-[2rem] p-7 text-white shadow-card-hover sm:p-12">
          <div aria-hidden className="bg-brand-dots absolute inset-0 -z-10" />
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2.5 text-[0.8125rem] font-extrabold text-accent">
                <span aria-hidden className="h-0.5 w-7 rounded-full bg-accent" />
                تحتاج مساعدة؟
              </p>
              <h2 className="mt-3 text-2xl font-extrabold leading-snug sm:text-3xl">فريقنا جاهز لمساعدتك في اختيار الخدمة</h2>
              <p className="mt-4 flex items-start gap-2 text-sm leading-7 text-white/75">
                <MapPin className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
                {settings.address}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild variant="outline" size="lg" className="border-white/25 text-white hover:border-white/60 hover:bg-white/10">
                <a href={phoneHref}>
                  <Phone className="size-4" aria-hidden="true" />
                  اتصل بنا
                </a>
              </Button>
              <Button asChild variant="whatsapp" size="lg">
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  واتساب
                </a>
              </Button>
              <Button asChild variant="gold" size="lg">
                <Link href="/contact">صفحة التواصل</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
