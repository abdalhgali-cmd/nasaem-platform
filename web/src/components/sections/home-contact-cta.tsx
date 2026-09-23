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
    <section className="py-16">
      <Container>
        <div className="overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-l from-primary/10 via-card to-accent/10 p-7 shadow-sm sm:p-10">
          <div className="flex flex-col items-start justify-between gap-7 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <p className="text-sm font-extrabold text-primary dark:text-secondary">تحتاج مساعدة؟</p>
              <h2 className="mt-2 text-2xl font-black text-foreground sm:text-3xl">فريقنا جاهز لمساعدتك في اختيار الخدمة</h2>
              <p className="mt-3 flex items-start gap-2 text-sm leading-7 text-muted-foreground">
                <MapPin className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                {settings.address}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild variant="outline" size="lg">
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
              <Button asChild size="lg">
                <Link href="/contact">صفحة التواصل</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
