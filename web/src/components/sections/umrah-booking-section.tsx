"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";

// Umrah has its own section (not a visa type in the visa lists). The request
// runs through the shared intake wizard on the Umrah packages: package →
// applicant → trip → pilgrims → documents (from the admin requirements) →
// summary with the final price → payment → confirmation.
function UmrahBookingContent() {
  const searchParams = useSearchParams();
  const packageCode = searchParams.get("package") || undefined;

  return <ServiceIntakeWizard service="package" initialServiceCode={packageCode} />;
}

export function UmrahBookingSection() {
  return (
    <Suspense fallback={<div className="min-h-40 animate-pulse rounded-3xl border border-border bg-muted/30" />}>
      <UmrahBookingContent />
    </Suspense>
  );
}
