"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ServiceIntakeWizard } from "@/components/sections/service-intake-wizard";
import { WizardSkeleton } from "@/components/sections/wizard-skeleton";

// Umrah has its own section (not a visa type in the visa lists). The request
// runs through the shared intake wizard in its Umrah flow: only the approved
// package types (visa only, flights, sea), in three steps — the package; the
// trip, applicant, guarantor, pilgrims and their documents; the review with
// the final price — then payment and confirmation.
function UmrahBookingContent() {
  const searchParams = useSearchParams();
  const packageCode = searchParams.get("package") || undefined;

  return <ServiceIntakeWizard service="package" initialServiceCode={packageCode} umrahFlow />;
}

export function UmrahBookingSection() {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <UmrahBookingContent />
    </Suspense>
  );
}
