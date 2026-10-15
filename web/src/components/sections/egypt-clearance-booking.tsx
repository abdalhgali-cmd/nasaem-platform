"use client";

import * as React from "react";
import { BusFront, Plane } from "lucide-react";

import {
  EgyptClearanceIntake,
  type EgyptClearanceRequirement,
  type EgyptFixedPrice,
} from "@/components/sections/egypt-clearance-intake";

export const EGYPT_UNAVAILABLE = "غير متاحة للحجز حاليًا";

// One card per entry-method variant (backend egypt-clearance-variants.js).
// `price` is set only when the agency published the variant with a fixed
// price; otherwise the card says it is not bookable and cannot be chosen.
// New bookings never fall back to a quote or to the original Egypt item.
export type EgyptVariantOption = {
  code: "VISA-EGYPT-CLEARANCE-AIR" | "VISA-EGYPT-CLEARANCE-BORDER";
  entryMode: "AIR" | "BORDER";
  name: string;
  visaTypeId: string | null;
  serviceId: string | null;
  price: EgyptFixedPrice | null;
  requirements: EgyptClearanceRequirement[];
};

function priceLine(price: EgyptFixedPrice) {
  const unit = price.priceUnit === "PER_TRAVELER" ? "للمسافر" : "للطلب";
  return `${price.unitPrice.toLocaleString("en-US")} ${price.currency} ${unit}`;
}

export function EgyptClearanceBooking({ options }: { options: EgyptVariantOption[] }) {
  const [selected, setSelected] = React.useState<EgyptVariantOption["code"] | null>(null);
  const bookable = options.filter((option) => option.price && option.visaTypeId);
  const chosen = bookable.find((option) => option.code === selected) ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-extrabold text-foreground" id="egypt-variants-title">نوع الموافقة وطريقة الدخول</h2>
        <div role="radiogroup" aria-labelledby="egypt-variants-title" className="mt-4 grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const available = Boolean(option.price && option.visaTypeId);
            const isSelected = option.code === selected;
            const Icon = option.entryMode === "AIR" ? Plane : BusFront;
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!available}
                data-testid="egypt-variant"
                data-code={option.code}
                onClick={() => setSelected(option.code)}
                className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-start transition ${
                  isSelected ? "border-accent bg-accent/5 ring-2 ring-accent/10" : "border-border"
                } ${available ? "hover:border-primary/40" : "cursor-not-allowed opacity-60"}`}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-secondary">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-bold text-foreground">{option.name}</span>
                  <span className={`mt-1 block text-sm ${available ? "font-extrabold text-foreground" : "text-muted-foreground"}`} dir={available ? "ltr" : undefined} data-testid="egypt-variant-price">
                    {option.price ? priceLine(option.price) : EGYPT_UNAVAILABLE}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {bookable.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-testid="egypt-unavailable">
            {EGYPT_UNAVAILABLE}. يرجى التواصل معنا للمساعدة.
          </p>
        ) : !chosen ? (
          <p className="mt-4 text-sm text-muted-foreground">اختر نوع الموافقة أولًا لعرض البيانات المطلوبة والإجمالي.</p>
        ) : null}
      </div>

      {chosen && chosen.visaTypeId && chosen.price ? (
        <div className="mt-6">
          <EgyptClearanceIntake
            key={chosen.code}
            visaTypeId={chosen.visaTypeId}
            serviceId={chosen.serviceId}
            requirements={chosen.requirements}
            fixedEntryMode={chosen.entryMode}
            fixedPrice={chosen.price}
          />
        </div>
      ) : null}
    </div>
  );
}
