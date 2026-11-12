import type { Metadata } from "next";
import { Container } from "@/components/container";
import { UmrahBookingSection } from "@/components/sections/umrah-booking-section";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  path: "/umrah",
  title: "طلب العمرة",
  description: "اختر باقة العمرة، أدخل بيانات المعتمرين وارفع المستندات، وراجع السعر النهائي بالريال السعودي والجنيه السوداني قبل الدفع.",
});

export default function UmrahPage() {
  return (
    <section id="book" aria-label="طلب العمرة" className="scroll-mt-24 bg-section pb-14 sm:pb-20">
      <div className="bg-brand-navy relative isolate overflow-hidden pb-24 pt-10 text-white sm:pb-28 sm:pt-14">
        <div aria-hidden className="bg-brand-dots absolute inset-0 -z-10" />
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2.5 text-[0.8125rem] font-extrabold text-accent">
              <span aria-hidden className="h-0.5 w-7 rounded-full bg-accent" />
              العمرة
            </p>
            <h1 className="mt-3 text-3xl font-extrabold leading-snug sm:text-4xl">
              اختر باقة العمرة
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/75 sm:text-base">
              اختر الباقة، أدخل بيانات المعتمرين وارفع المستندات، وراجع السعر النهائي قبل الدفع.
            </p>
          </div>
        </Container>
      </div>
      {/* The wizard card overlaps the navy band so the page reads as one piece. */}
      <Container className="relative -mt-16 sm:-mt-20">
        <UmrahBookingSection />
      </Container>
    </section>
  );
}
