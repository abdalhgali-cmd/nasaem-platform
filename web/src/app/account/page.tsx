import type { Metadata } from "next";
import { Container } from "@/components/container";
import { PageHero } from "@/components/sections/page-hero";
import { AccountDashboard } from "@/components/sections/account-dashboard";

export const metadata: Metadata = {
  title: "حسابي",
  description: "تابع طلباتك ومستنداتك وكوبوناتك وبياناتك الشخصية في نسائم الحرمين.",
};

export default function AccountPage() {
  return (
    <>
      <PageHero
        eyebrow="حسابي"
        breadcrumb="حسابي"
        title="لوحة حسابك"
        description="طلباتك، مستنداتك، كوبوناتك وبياناتك الشخصية في مكان واحد."
      />
      <section className="py-16">
        <Container>
          <AccountDashboard />
        </Container>
      </section>
    </>
  );
}
