import type { Metadata } from "next";
import { FerryServiceClient } from "@/components/sections/ferry-service-client";

export const metadata: Metadata = {
  title: "حجز العبارات",
  description: "اطلب حجز العبارة واترك بيانات الرحلة لفريق نسائم الحرمين لمتابعة الحجز.",
};

export default function FerriesPage() {
  return <FerryServiceClient />;
}
