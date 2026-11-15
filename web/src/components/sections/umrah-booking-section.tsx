"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";
import { WizardSkeleton } from "@/components/sections/wizard-skeleton";

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
    <Suspense fallback={<WizardSkeleton />}>
      <UmrahBookingContent />
    </Suspense>
  );
}
