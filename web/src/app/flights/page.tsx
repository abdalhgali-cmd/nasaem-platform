import type { Metadata } from "next";
import { FlightSearchClient } from "@/components/sections/flight-search-client";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  path: "/flights",
  title: "حجز تذاكر الطيران",
  description: "ابحث عن رحلات الطيران ذهاب فقط أو ذهاب وعودة أو مدن متعددة مع نسائم الحرمين.",
});

export default function FlightsPage() {
  return <FlightSearchClient />;
}
