import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";
import { FadeIn, Stagger } from "@/components/motion/fade-in";
import { resolveServiceHref, type RoutableItem } from "@/lib/service-routes";

type RelatedItem = RoutableItem & { name: string; country?: string };

// Shared by every dedicated/generic service page — always resolves through
// the same central resolveServiceHref() every other service link on the
// site uses, so a related-service card never re-derives its own
// destination logic.
export function RelatedServices({ items }: { items: RelatedItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="py-16">
      <Container>
        <SectionHeading eyebrow="خدمات أخرى" title="قد تهمك أيضًا" align="start" />
        <Stagger className="mt-8 grid gap-4 sm:grid-cols-3">
          {items.map((item, index) => (
            <FadeIn key={item.code} delay={index * 0.05}>
              <Link
                href={resolveServiceHref(item)}
                className="group flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
              >
                <span className="text-sm font-bold text-foreground">{item.name}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary dark:text-secondary">
                  عرض التفاصيل
                  <ArrowLeft className="size-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
                </span>
              </Link>
            </FadeIn>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}
