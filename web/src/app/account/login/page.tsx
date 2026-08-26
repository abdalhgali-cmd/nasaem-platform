import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { AccountAuthCard } from "@/components/sections/account-auth-card";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  description: "سجّل الدخول إلى حسابك في نسائم الحرمين لمتابعة طلباتك ومستنداتك وكوبوناتك.",
};

export default function AccountLoginPage() {
  return (
    <>
      <PageHero
        eyebrow="حسابي"
        breadcrumb="تسجيل الدخول"
        title="سجّل الدخول إلى حسابك"
        description="تابع طلباتك ومستنداتك، واستفد من كوبونات الخصم الخاصة بك."
      />
      <section className="py-24">
        <Container>
          <AccountAuthCard mode="login" />
        </Container>
      </section>
    </>
  );
}
