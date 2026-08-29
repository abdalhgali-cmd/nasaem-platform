import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { AccountForgotPasswordCard } from "@/components/sections/account-forgot-password-card";

export const metadata: Metadata = {
  title: "استعادة كلمة المرور",
  description: "أعد تعيين كلمة مرور حسابك في نسائم الحرمين عبر رمز تحقق يصلك على واتساب.",
};

export default function AccountForgotPasswordPage() {
  return (
    <>
      <PageHero
        eyebrow="حسابي"
        breadcrumb="استعادة كلمة المرور"
        title="استعد الوصول لحسابك"
        description="أدخل رقم هاتفك وسنرسل لك رمز إعادة التعيين عبر واتساب."
      />
      <section className="py-24">
        <Container>
          <AccountForgotPasswordCard />
        </Container>
      </section>
    </>
  );
}
