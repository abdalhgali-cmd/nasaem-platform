"use client";

import { useSearchParams } from "next/navigation";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";

export function UmrahBookingSection() {
  const searchParams = useSearchParams();
  const packageCode = searchParams.get("package") || undefined;

  return <ServiceIntakeWizard service="package" initialServiceCode={packageCode} />;
}
