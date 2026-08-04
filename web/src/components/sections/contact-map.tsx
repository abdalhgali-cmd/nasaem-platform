import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn } from "@/components/motion/fade-in";
import { ContactForm } from "@/components/sections/contact-form";
import { siteConfig } from "@/lib/site-config";

const contactCards = [
  { icon: Phone, label: "اتصل بنا", value: siteConfig.phone, href: `tel:${siteConfig.phone.replace(/\s/g, "")}`, dir: "ltr" as const },
  { icon: Mail, label: "راسلنا", value: siteConfig.email, href: `mailto:${siteConfig.email}` },
  { icon: MapPin, label: "زُرنا", value: siteConfig.address, href: undefined },
  { icon: Clock, label: "ساعات العمل", value: "السبت - الخميس: ٨ص - ٩م", href: undefined },
];

export function ContactMap() {
  return (
    <section className="py-24">
      <Container>
        <SectionHeading
          eyebrow="تواصل معنا"
          title="نحن هنا لمساعدتك في كل خطوة"
          description="راسلنا عبر النموذج، أو تواصل مباشرة على الهاتف والواتساب."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {contactCards.map((card, index) => (
            <FadeIn key={card.label} delay={index * 0.05}>
              <div className="flex h-full flex-col items-center rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                  <card.icon className="size-6" />
                </span>
                <span className="mt-3 text-xs font-semibold text-muted-foreground">
                  {card.label}
                </span>
                {card.href ? (
                  <a
                    href={card.href}
                    dir={card.dir}
                    className="mt-1 text-sm font-bold text-foreground hover:text-primary"
                  >
                    {card.value}
                  </a>
                ) : (
                  <span className="mt-1 text-sm font-bold text-foreground">{card.value}</span>
                )}
              </div>
            </FadeIn>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-5">
          <FadeIn className="lg:col-span-3">
            <ContactForm />
          </FadeIn>

          <FadeIn delay={0.1} className="lg:col-span-2">
            <div className="h-full min-h-[320px] overflow-hidden rounded-3xl border border-border shadow-sm">
              <iframe
                title={`موقع ${siteConfig.shortName} على الخريطة`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(
                  siteConfig.address
                )}&output=embed`}
                className="h-full min-h-[320px] w-full"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </FadeIn>
        </div>
      </Container>
    </section>
  );
}
