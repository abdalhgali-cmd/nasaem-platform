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
    <main id="book" className="scroll-mt-24 bg-gradient-to-b from-primary/8 via-background to-background py-10 sm:py-14">
      <Container>
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-sm font-black text-primary dark:text-secondary">العمرة</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            اختر الباقة وأرسل طلبك
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            اختر الباقة، أدخل بيانات مقدم الطلب والمعتمرين، ارفع الجواز وإقامة الضامن، ثم راجع السعر النهائي قبل الدفع.
          </p>
        </div>
        <UmrahBookingSection />
      </Container>
    </main>
  );
}
