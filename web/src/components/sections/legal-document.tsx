import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { LEGAL_DOCS } from "@/lib/legal-content";
import { siteConfig } from "@/lib/site-config";

export function LegalDocument({ id }: { id: keyof typeof LEGAL_DOCS }) {
  const doc = LEGAL_DOCS[id];
  return (
    <>
      <PageHero eyebrow="معلومات مهمة" breadcrumb={doc.title} title={doc.title} description={doc.intro} />
      <section className="py-16 sm:py-24">
        <Container className="max-w-3xl">
          <div className="space-y-10">
            {doc.sections.map((section) => (
              <article key={section.h}>
                <h2 className="text-xl font-extrabold text-foreground">{section.h}</h2>
                {section.p.map((text) => (
                  <p key={text} className="mt-3 leading-8 text-muted-foreground">
                    {text}
                  </p>
                ))}
              </article>
            ))}
          </div>
          <div className="mt-12 rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-extrabold text-foreground">للتواصل معنا</h2>
            <p className="mt-3 leading-8 text-muted-foreground">
              {siteConfig.name} — {siteConfig.address}
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
            >
              تواصل معنا
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
