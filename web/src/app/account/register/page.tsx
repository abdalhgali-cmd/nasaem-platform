import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { AccountAuthCard } from "@/components/sections/account-auth-card";

export const metadata: Metadata = {
  title: "إنشاء حساب",
  description: "أنشئ حسابك في نسائم الحرمين لمتابعة طلباتك ومستنداتك والاستفادة من الكوبونات.",
};

export default function AccountRegisterPage() {
  return (
    <>
      <PageHero
        eyebrow="حسابي"
        breadcrumb="إنشاء حساب"
        title="أنشئ حسابك الآن"
        description="تابع طلباتك ومستنداتك، واستفد من كوبونات الخصم الخاصة بك."
      />
      <section className="py-24">
        <Container>
          <AccountAuthCard mode="register" />
        </Container>
      </section>
    </>
  );
}
