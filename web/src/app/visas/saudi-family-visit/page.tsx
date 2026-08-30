import type { Metadata } from "next";
import {
  Bell,
  Clock3,
  FileCheck2,
  FileText,
  MessageCircle,
  Phone,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { SaudiFamilyVisitHero } from "@/components/sections/saudi-family-visit-hero";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";
import { Faq, type FaqItem } from "@/components/sections/faq";
import { RelatedServices } from "@/components/sections/related-services";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { getPublicSiteSettings } from "@/lib/public-settings";
import { buildPageMetadata } from "@/lib/seo";

// The VisaType code seeded for this service (backend/prisma/seed.js) —
// admins can rename/re-price/re-describe it freely from the Visa Types
// admin UI; this page only ever reads that data, never hardcodes it.
const VISA_CODE = "VISA-FAMILY-VISIT";
const PAGE_PATH = "/visas/saudi-family-visit";
const FALLBACK_TITLE = "الزيارة العائلية للسعودية";
const FALLBACK_DESCRIPTION =
  "قدّم طلب الزيارة العائلية للسعودية إلكترونيًا من هاتفك، وتابع حالته خطوة بخطوة حتى استلام الوثيقة النهائية.";

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
};

type PublicRequirement = {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
};

async function getVisaTypes(): Promise<PublicVisaType[]> {
  try {
    const response = await fetch(`${API_URL}/services/public`, { next: { revalidate: 60 } });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: { visaTypes?: PublicVisaType[] } };
    return payload.data?.visaTypes ?? [];
  } catch {
    return [];
  }
}

async function getFamilyVisitVisaType(): Promise<PublicVisaType | null> {
  const visaTypes = await getVisaTypes();
  return visaTypes.find((visa) => visa.code === VISA_CODE) ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const visaType = await getFamilyVisitVisaType();
  return buildPageMetadata({
    path: PAGE_PATH,
    title: visaType?.name || FALLBACK_TITLE,
    description: visaType?.description || FALLBACK_DESCRIPTION,
  });
}

async function getRequirements(visaTypeId: string): Promise<PublicRequirement[]> {
  try {
    const response = await fetch(`${API_URL}/visa-types/${visaTypeId}/requirements/public`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: PublicRequirement[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

// SAUDI_FAMILY_VISIT_FAQ (see backend/src/modules/settings/settings.service.js)
// is a Setting row an admin edits through the existing free-form Settings
// editor — no dedicated FAQ module for this one service.
async function getFamilyVisitFaq(): Promise<FaqItem[]> {
  try {
    const response = await fetch(`${API_URL}/settings/public`, { next: { revalidate: 60 } });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: { key: string; value: string }[] };
    const entry = payload.data?.find((setting) => setting.key === "SAUDI_FAMILY_VISIT_FAQ");
    if (!entry) return [];
    const parsed = JSON.parse(entry.value) as { question: string; answer: string }[];
    return parsed.map((item, index) => ({
      id: `saudi-family-visit-faq-${index}`,
      question: item.question,
      answer: item.answer,
      sortOrder: index,
    }));
  } catch {
    return [];
  }
}

const steps = [
  { title: "بياناتك", description: "أدخل اسمك ورقم هاتفك للتواصل بخصوص طلبك." },
  { title: "بيانات السفر", description: "أضف بيانات كل فرد من العائلة المسافرة." },
  { title: "المستندات", description: "أرفق المستندات المطلوبة، أو أرسل الطلب وارفعها لاحقًا من صفحة التتبع." },
  { title: "المراجعة والإرسال", description: "راجع بياناتك ثم أرسل الطلب لتصلك حالته وخطوته التالية أولًا بأول." },
];

// A fixed, honest list of what NASAEM's existing systems actually do for
// this request — never a superlative or unverifiable promise, per the
// platform's marketing-claims policy.
const whyNasaem = [
  {
    icon: Bell,
    title: "خطوة تالية واضحة دائمًا",
    description: "تعرف بالضبط ما هو المطلوب منك الآن، دون الحاجة للاتصال للسؤال.",
  },
  {
    icon: ShieldCheck,
    title: "وصول آمن لمستنداتك فقط",
    description: "لا يمكن لأي عميل آخر الوصول إلى مستنداتك أو وثيقتك النهائية.",
  },
  {
    icon: FileText,
    title: "تسليم إلكتروني للوثيقة النهائية",
    description: "تصلك الوثيقة كملف قابل للتنزيل من صفحة تتبع طلبك فور اعتمادها.",
  },
  {
    icon: Clock3,
    title: "متابعة حالة الطلب في أي وقت",
    description: "استخدم رقم هاتفك لعرض حالة طلبك وحالة كل مستند من صفحة التتبع.",
  },
];

export default async function SaudiFamilyVisitPage() {
  const [visaTypes, settings] = await Promise.all([
    getVisaTypes(),
    getPublicSiteSettings(),
  ]);
  const visaType = visaTypes.find((visa) => visa.code === VISA_CODE) ?? null;
  const relatedVisaTypes = visaTypes.filter((visa) => visa.code !== VISA_CODE).slice(0, 3);
  const [requirements, faqItems] = await Promise.all([
    visaType ? getRequirements(visaType.id) : Promise.resolve<PublicRequirement[]>([]),
    getFamilyVisitFaq(),
  ]);

  const numericPrice = visaType ? Number(visaType.basePrice) : NaN;
  const hasPublishedPrice = Number.isFinite(numericPrice) && numericPrice > 0;

  const quickFacts = [
    visaType?.processingTime ? { label: "مدة المعالجة", value: visaType.processingTime } : null,
    visaType?.validity ? { label: "صلاحية التأشيرة", value: visaType.validity } : null,
    visaType?.stayDuration ? { label: "مدة الإقامة", value: visaType.stayDuration } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  // Same price source as the quick-facts card below (Pricing/Admin via the
  // VisaType record) — just formatted as short hero copy instead of a card.
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
      <SaudiFamilyVisitHero
        title={visaType?.name || "الزيارة العائلية للسعودية"}
        description={
          visaType?.description ||
          "قدّم بيانات عائلتك ومستنداتها إلكترونيًا، وتابع حالة الطلب خطوة بخطوة حتى استلام التأشيرة."
        }
        priceLabel={heroPriceLabel}
        priceSubLabel={heroPriceSubLabel}
        isAccepting={Boolean(visaType)}
      />

      <section className="py-16">
        <Container>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-3xl border border-accent/40 bg-accent/5 p-6 text-center">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Wallet className="size-4" />
                التكلفة
              </span>
              {hasPublishedPrice && visaType ? (
                <>
                  <p className="mt-2 text-2xl font-extrabold text-primary dark:text-secondary" dir="ltr">
                    {numericPrice.toLocaleString("en-US")} {visaType.currency}
                  </p>
                  {visaType.currency !== "SDG" && visaType.priceSdg != null ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      يعادل {Math.round(visaType.priceSdg).toLocaleString("en-US")} جنيه سوداني
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-muted-foreground">يتم تحديد التكلفة بعد مراجعة الطلب</p>
              )}
            </div>
            {quickFacts.map((fact) => (
              <div key={fact.label} className="rounded-3xl border border-border bg-card p-6 text-center">
                <span className="text-xs font-semibold text-muted-foreground">{fact.label}</span>
                <p className="mt-2 text-lg font-bold text-foreground">{fact.value}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="خطوات بسيطة" title="كيف تقدّم طلبك؟" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <FadeIn key={step.title} delay={index * 0.06}>
                <div className="relative rounded-3xl border border-border bg-card p-6 shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="py-24">
        <Container>
          <SectionHeading
            eyebrow="المستندات المطلوبة"
            title="جهّز هذه المستندات مسبقًا"
            description="القائمة أدناه محدثة من فريق الإدارة، وقد تظهر لك تفاصيل إضافية داخل نموذج التقديم حسب حالتك."
          />
          <Stagger className="mt-12 grid gap-4 sm:grid-cols-2">
            {requirements.length ? (
              requirements.map((requirement) => (
                <FadeIn key={requirement.id}>
                  <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary">
                      <FileCheck2 className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {requirement.name}
                        {requirement.required ? (
                          <span className="ms-1 text-xs font-bold text-destructive">*</span>
                        ) : (
                          <span className="ms-1 text-xs font-normal text-muted-foreground">(اختياري)</span>
                        )}
                      </p>
                      {requirement.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{requirement.description}</p>
                      ) : null}
                    </div>
                  </div>
                </FadeIn>
              ))
            ) : (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                سيتم عرض المستندات المطلوبة هنا فور اعتمادها من فريق الإدارة.
              </p>
            )}
          </Stagger>
        </Container>
      </section>

      <section className="bg-section py-24">
        <Container>
          <SectionHeading eyebrow="لماذا نسائم الحرمين" title="كيف نساعدك في هذا الطلب تحديدًا" />
          <Stagger className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyNasaem.map((item, index) => (
              <FadeIn key={item.title} delay={index * 0.06}>
                <div className="flex h-full flex-col items-center rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:text-secondary">
                    <item.icon className="size-6" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              </FadeIn>
            ))}
          </Stagger>
        </Container>
      </section>

      <section id="book" className="scroll-mt-24 py-24">
        <Container>
          <SectionHeading eyebrow="ابدأ الآن" title="قدّم طلب الزيارة العائلية" />
          <div className="mt-12">
            <ServiceIntakeWizard service="visa" initialServiceCode={VISA_CODE} />
          </div>
        </Container>
      </section>

      <Faq items={faqItems} />

      <RelatedServices items={relatedVisaTypes} />

      <section className="py-16">
        <Container>
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-foreground">تحتاج مساعدة؟</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              تواصل معنا مباشرة وسيساعدك فريقنا في أي خطوة من طلبك.
            </p>
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
