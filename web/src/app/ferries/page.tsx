import type { Metadata } from "next";
import { FerryServiceClient } from "@/components/sections/ferry-service-client";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  path: "/ferries",
  title: "حجز العبارات",
  description: "اطلب حجز العبارة واترك بيانات الرحلة لفريق نسائم الحرمين لمتابعة الحجز.",
});

export default function FerriesPage() {
  return <FerryServiceClient />;
}
