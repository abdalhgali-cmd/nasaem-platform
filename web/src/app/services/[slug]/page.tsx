import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileCheck2, MessageCircle, Phone } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { PageHero } from "@/components/sections/page-hero";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";
import { RelatedServices } from "@/components/sections/related-services";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api-url";
import { getPublicSiteSettings } from "@/lib/public-settings";
import { buildPageMetadata } from "@/lib/seo";
import { resolveServiceHref, slugifyServiceCode } from "@/lib/service-routes";
import { resolveServiceHeroMedia, type ServiceHeroMedia } from "@/lib/service-hero-media";

// Generic template for any service/visa type that doesn't (yet) have a
// hand-built dedicated experience — Section 5 of the routing spec. It
// reuses the same public catalog, Requirements Engine, and intake wizard
// every dedicated page already reuses; it never invents its own booking
// flow. A service is promoted out of this template by adding it to
// DEDICATED_ROUTES in lib/service-routes.ts, not by touching this file.

type PublicRequirement = {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
};

type CatalogService = { id: string; code: string; name: string; category: string; description: string | null; basePrice: string; currency: string; priceSdg: number | null } & ServiceHeroMedia;
type CatalogVisaType = { id: string; code: string; name: string; category: string; description: string | null; basePrice: string; currency: string; priceSdg: number | null; country: string; serviceId: string | null };

type ResolvedItem =
  | ({ kind: "service" } & CatalogService)
  | ({ kind: "visaType" } & CatalogVisaType);

async function getFullCatalog(): Promise<{ services: CatalogService[]; visaTypes: CatalogVisaType[] }> {
  try {
    const response = await fetch(`${API_URL}/services/public`, { next: { revalidate: 60 } });
    if (!response.ok) return { services: [], visaTypes: [] };
    const payload = (await response.json()) as { data?: { services?: CatalogService[]; visaTypes?: CatalogVisaType[] } };
    return { services: payload.data?.services ?? [], visaTypes: payload.data?.visaTypes ?? [] };
  } catch {
    return { services: [], visaTypes: [] };
  }
}

function resolveItemFromCatalog(
  slug: string,
  catalog: { services: CatalogService[]; visaTypes: CatalogVisaType[] }
): ResolvedItem | null {
  const service = catalog.services.find((item) => slugifyServiceCode(item.code) === slug);
  if (service) {
    // A service promoted to a dedicated page must not also render here —
    // keeps this template and DEDICATED_ROUTES from ever disagreeing.
    if (resolveServiceHref(service) !== `/services/${slug}`) return null;
    return { kind: "service", ...service };
  }

  const visaType = catalog.visaTypes.find((item) => slugifyServiceCode(item.code) === slug);
  if (visaType) {
    if (resolveServiceHref(visaType) !== `/services/${slug}`) return null;
    return { kind: "visaType", ...visaType };
  }

  return null;
}

async function resolveItemBySlug(slug: string): Promise<ResolvedItem | null> {
  const catalog = await getFullCatalog();
  return resolveItemFromCatalog(slug, catalog);
}

async function getRequirements(item: ResolvedItem): Promise<PublicRequirement[]> {
  try {
    const scope = item.kind === "service" ? "services" : "visa-types";
    const response = await fetch(`${API_URL}/${scope}/${item.id}/requirements/public`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: PublicRequirement[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await resolveItemBySlug(slug);
  if (!item) return { title: "الخدمة غير متاحة" };
  return buildPageMetadata({
    path: `/services/${slug}`,
    title: item.name,
    description: item.description || `قدّم طلب ${item.name} إلكترونيًا وتابع حالته خطوة بخطوة.`,
  });
}

export default async function GenericServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [catalog, settings] = await Promise.all([getFullCatalog(), getPublicSiteSettings()]);
  const item = resolveItemFromCatalog(slug, catalog);
  if (!item) notFound();

  const relatedItems = [...catalog.services, ...catalog.visaTypes]
    .filter((candidate) => candidate.code !== item.code)
    .slice(0, 3);

  const requirements = await getRequirements(item);

  const numericPrice = Number(item.basePrice);
  const hasPublishedPrice = Number.isFinite(numericPrice) && numericPrice > 0;

  // A Service record carries its own hero media; a VisaType's hero media
  // lives on its linked Service (same lookup EgyptClearanceHero/
  // SaudiFamilyVisitHero's pages do), since VisaType has no media columns
  // of its own.
  const heroMediaSource =
    item.kind === "service" ? item : (catalog.services.find((s) => s.id === item.serviceId) ?? null);
  const heroMedia = resolveServiceHeroMedia(heroMediaSource, API_URL);

  return (
    <>
      <PageHero
        eyebrow="خدمة نسائم الحرمين"
        breadcrumb={item.name}
        title={item.name}
        description={item.description || "قدّم بياناتك ومستنداتك إلكترونيًا، وتابع حالة طلبك خطوة بخطوة."}
        imageUrl={heroMedia.heroImageUrl}
        mobileImageUrl={heroMedia.heroImageMobileUrl}
        motionEnabled={heroMedia.motionEnabled}
        motionVideoUrl={heroMedia.motionVideoUrl}
      />

      <section className="py-16">
        <Container>
          <div className="mx-auto max-w-sm rounded-3xl border border-accent/40 bg-accent/5 p-6 text-center">
            <span className="text-xs font-semibold text-muted-foreground">التكلفة</span>
            {hasPublishedPrice ? (
              <>
                <p className="mt-2 text-2xl font-extrabold text-primary dark:text-secondary" dir="ltr">
                  {numericPrice.toLocaleString("en-US")} {item.currency}
                </p>
                {item.currency !== "SDG" && item.priceSdg != null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    يعادل {Math.round(item.priceSdg).toLocaleString("en-US")} جنيه سوداني
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm font-semibold text-muted-foreground">يتم تحديد التكلفة بعد مراجعة الطلب</p>
            )}
          </div>
        </Container>
      </section>

      <section className="py-16">
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
                لا توجد مستندات مطلوبة مسبقًا لهذه الخدمة.
              </p>
            )}
          </Stagger>
        </Container>
      </section>

      <section id="book" className="scroll-mt-24 py-24">
        <Container>
          <SectionHeading eyebrow="ابدأ الآن" title={`قدّم طلب ${item.name}`} />
          <div className="mt-12">
            <ServiceIntakeWizard service={item.kind === "service" ? "package" : "visa"} initialServiceCode={item.code} />
          </div>
        </Container>
      </section>

      <RelatedServices items={relatedItems} />

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
