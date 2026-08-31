import type { Metadata } from "next";
import { Clock3, FileCheck2, MessageCircle, Phone, ShieldCheck, Wallet } from "lucide-react";

import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { EgyptClearanceHero } from "@/components/sections/egypt-clearance-hero";
import {
  EgyptClearanceIntake,
  type EgyptClearanceRequirement,
} from "@/components/sections/egypt-clearance-intake";
import { Faq, type FaqItem } from "@/components/sections/faq";
import { RelatedServices } from "@/components/sections/related-services";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { getPublicSiteSettings } from "@/lib/public-settings";
import { buildPageMetadata } from "@/lib/seo";
import { resolveServiceHeroMedia, type ServiceHeroMedia } from "@/lib/service-hero-media";

const VISA_CODE = "VISA-EGYPT-CLEARANCE";
const PAGE_PATH = "/visas/egypt-security-approval";
const FALLBACK_TITLE = "الموافقة الأمنية للسفر إلى مصر";
const FALLBACK_DESCRIPTION =
  "قدّم طلب الموافقة الأمنية لمصر الآن حتى لو لم تحدد موعد السفر بعد، ثم أكمل الحجز والتعميم لاحقًا من نفس الطلب.";

type PublicVisaType = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  basePrice: string;
  currency: string;
  priceSdg: number | null;
  processingTime: string | null;
  stayDuration: string | null;
  validity: string | null;
  entryType: string | null;
  serviceId: string | null;
};

type PublicService = { id: string } & ServiceHeroMedia;

async function getCatalog(): Promise<{ services: PublicService[]; visaTypes: PublicVisaType[] }> {
  try {
    const response = await fetch(`${API_URL}/services/public`, { next: { revalidate: 60 } });
    if (!response.ok) return { services: [], visaTypes: [] };
    const payload = (await response.json()) as {
      data?: { services?: PublicService[]; visaTypes?: PublicVisaType[] };
    };
    return { services: payload.data?.services ?? [], visaTypes: payload.data?.visaTypes ?? [] };
  } catch {
    return { services: [], visaTypes: [] };
  }
}

async function getEgyptClearanceVisaType(): Promise<PublicVisaType | null> {
  const { visaTypes } = await getCatalog();
  return visaTypes.find((visa) => visa.code === VISA_CODE) ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const visaType = await getEgyptClearanceVisaType();
  return buildPageMetadata({
    path: PAGE_PATH,
    title: visaType?.name || FALLBACK_TITLE,
    description: visaType?.description || FALLBACK_DESCRIPTION,
  });
}

async function getRequirements(visaTypeId: string): Promise<EgyptClearanceRequirement[]> {
  try {
    const response = await fetch(`${API_URL}/visa-types/${visaTypeId}/requirements/public`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: EgyptClearanceRequirement[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

async function getEgyptClearanceFaq(): Promise<FaqItem[]> {
  try {
    const response = await fetch(`${API_URL}/settings/public`, { next: { revalidate: 60 } });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: { key: string; value: string }[] };
    const entry = payload.data?.find((setting) => setting.key === "EGYPT_CLEARANCE_FAQ");
    if (!entry) return [];
    const parsed = JSON.parse(entry.value) as { question: string; answer: string }[];
    return parsed.map((item, index) => ({
      id: `egypt-clearance-faq-${index}`,
      question: item.question,
      answer: item.answer,
      sortOrder: index,
    }));
  } catch {
    return [];
  }
}

const journey = [
  {
    title: "قدّم الموافقة الآن",
    description: "أدخل بياناتك الأساسية وارفع الجواز. لا نطلب حجزًا أو تاريخ سفر في هذه المرحلة.",
  },
  {
    title: "حدّد السفر عندما تكون جاهزًا",
    description: "يمكن أن يكون سفرك لاحقًا حتى بعد عدة أشهر. عندما تحدد الموعد تكمل نفس الطلب، ولا تبدأ معاملة جديدة.",
  },
  {
    title: "أكمل الحجز والتعميم",
    description: "إذا كنت حاجزًا ترفع التذكرة، وإن لم تكن حاجزًا يمكنك طلب حجز جوي أو بري من نسائم الحرمين. التعميم يُجهّز قبل الرحلة بمدة لا تقل عن 72 ساعة.",
  },
];

export default async function EgyptSecurityApprovalPage() {
  const [{ services, visaTypes }, settings] = await Promise.all([
    getCatalog(),
    getPublicSiteSettings(),
  ]);
  const visaType = visaTypes.find((visa) => visa.code === VISA_CODE) ?? null;
  const relatedVisaTypes = visaTypes.filter((visa) => visa.code !== VISA_CODE).slice(0, 3);
  const linkedService = visaType?.serviceId ? (services.find((service) => service.id === visaType.serviceId) ?? null) : null;
  const heroMedia = resolveServiceHeroMedia(linkedService, API_URL);
  const [requirements, faqItems] = await Promise.all([
    visaType ? getRequirements(visaType.id) : Promise.resolve<EgyptClearanceRequirement[]>([]),
    getEgyptClearanceFaq(),
  ]);

  const numericPrice = visaType ? Number(visaType.basePrice) : NaN;
  const hasPublishedPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const heroPriceLabel =
    hasPublishedPrice && visaType
      ? `${numericPrice.toLocaleString("en-US")} ${visaType.currency}`
      : "يتم تحديد التكلفة بعد مراجعة الطلب";
  const heroPriceSubLabel =
    hasPublishedPrice && visaType && visaType.currency !== "SDG" && visaType.priceSdg != null
      ? `يعادل ${Math.round(visaType.priceSdg).toLocaleString("en-US")} جنيه سوداني`
      : null;

  return (
    <>
      <EgyptClearanceHero
        title={visaType?.name || FALLBACK_TITLE}
        description={visaType?.description || FALLBACK_DESCRIPTION}
        priceLabel={heroPriceLabel}
        priceSubLabel={heroPriceSubLabel}
        isAccepting={Boolean(visaType)}
        heroImageUrl={heroMedia.heroImageUrl}
        heroImageMobileUrl={heroMedia.heroImageMobileUrl}
        motionEnabled={heroMedia.motionEnabled}
        motionVideoUrl={heroMedia.motionVideoUrl}
      />

      <section id="book" className="scroll-mt-24 py-12 sm:py-16">
        <Container>
          <SectionHeading
            eyebrow="ابدأ مباشرة"
            title="قدّم طلب الموافقة الأمنية"
            description="الموافقة لا تتطلب وجود حجز سفر الآن. أدخل بيانات المسافر وارفع الجواز، ثم تابع بقية الرحلة من نفس الطلب لاحقًا."
          />
          <div className="mt-9">
            {visaType ? (
              <EgyptClearanceIntake
                visaTypeId={visaType.id}
                serviceId={visaType.serviceId}
                requirements={requirements}
              />
            ) : (
              <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                استقبال طلبات هذه الخدمة متوقف مؤقتًا. يرجى التواصل معنا للمساعدة.
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="bg-section py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow="كيف تعمل الخدمة؟" title="الموافقة أولًا، والسفر لاحقًا" />
          <Stagger className="mt-10 grid gap-5 lg:grid-cols-3">
            {journey.map((item, index) => (
              <FadeIn key={item.title} delay={index * 0.06}>
                <div className="h-full rounded-3xl border border-border bg-card p-6 shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-3xl border border-accent/40 bg-accent/5 p-6 text-center">
              <Wallet className="mx-auto size-5 text-primary dark:text-secondary" />
              <p className="mt-2 text-xs font-semibold text-muted-foreground">التكلفة</p>
              <p className="mt-2 text-xl font-extrabold text-foreground" dir="ltr">{heroPriceLabel}</p>
              {heroPriceSubLabel ? <p className="mt-1 text-xs text-muted-foreground">{heroPriceSubLabel}</p> : null}
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 text-center">
              <ShieldCheck className="mx-auto size-5 text-primary dark:text-secondary" />
              <p className="mt-2 text-sm font-bold text-foreground">المطلوب للبدء</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">بيانات المسافر + طريقة الدخول + صورة الجواز. الحجز ليس شرطًا الآن.</p>
            </div>
            <div className="rounded-3xl border border-border bg-card p-6 text-center">
              <Clock3 className="mx-auto size-5 text-primary dark:text-secondary" />
              <p className="mt-2 text-sm font-bold text-foreground">قاعدة التعميم</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">ترتبط بموعد الرحلة فقط، ويجب تجهيزها قبل الدخول بمدة لا تقل عن 72 ساعة.</p>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-section py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow="المطلوب الآن" title="متطلبات طلب الموافقة الأساسية" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {requirements.filter((requirement) => requirement.required).map((requirement) => (
              <div key={requirement.id} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary">
                  <FileCheck2 className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-foreground">{requirement.name}</p>
                  {requirement.description ? <p className="mt-1 text-xs text-muted-foreground">{requirement.description}</p> : null}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Faq items={faqItems} />
      <RelatedServices items={relatedVisaTypes} />

      <section className="py-16">
        <Container>
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-foreground">تحتاج مساعدة في الطلب؟</h2>
            <p className="mt-2 text-sm text-muted-foreground">فريق نسائم الحرمين متاح لمساعدتك في الموافقة، الحجز، والتعميم.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <Button asChild variant="gold" size="lg">
                <a href={`https://wa.me/${settings.whatsapp}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" />
                  تواصل واتساب
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                  <Phone className="size-4" />
                  {settings.phone}
                </a>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
