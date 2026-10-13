"use client";

// Explicit pricing configuration for a catalog item (service, package or
// visa type). "QUOTE": the agency quotes after review and the customer
// approves that exact version. "FIXED": the price is final; the customer
// confirms the total when ordering and no second approval follows. Never
// inferred from the price (backend contact-request-pricing/fixed-price.js).

export type PricingMode = "QUOTE" | "FIXED";
export type PriceUnit = "PER_REQUEST" | "PER_TRAVELER";
export type PricingFields = { pricingMode: PricingMode; priceUnit: PriceUnit; paymentAfterDocumentReview: boolean };

export const emptyPricing: PricingFields = { pricingMode: "QUOTE", priceUnit: "PER_REQUEST", paymentAfterDocumentReview: false };

export function pricingFrom(item: Partial<PricingFields> | null | undefined): PricingFields {
  return {
    pricingMode: item?.pricingMode === "FIXED" ? "FIXED" : "QUOTE",
    priceUnit: item?.priceUnit === "PER_TRAVELER" ? "PER_TRAVELER" : "PER_REQUEST",
    paymentAfterDocumentReview: Boolean(item?.paymentAfterDocumentReview),
  };
}

export function pricingLabel(mode: string | null | undefined) {
  return mode === "FIXED" ? "سعر ثابت" : "بعرض سعر";
}

const field = "mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal";

export function PricingModeFields({ value, onChange }: { value: PricingFields; onChange: (next: PricingFields) => void }) {
  const fixed = value.pricingMode === "FIXED";
  return (
    <fieldset className="col-span-full grid gap-4 rounded-2xl border border-border bg-background/60 p-4 sm:grid-cols-3" data-testid="pricing-mode-fields">
      <legend className="px-1 text-sm font-black">طريقة التسعير</legend>
      <label className="text-sm font-bold">
        التسعير
        <select value={value.pricingMode} onChange={(e) => onChange({ ...value, pricingMode: e.target.value as PricingMode })} className={field} name="pricingMode">
          <option value="QUOTE">بعرض سعر من الوكالة</option>
          <option value="FIXED">سعر ثابت نهائي</option>
        </select>
      </label>
      <label className="text-sm font-bold">
        وحدة السعر
        <select value={value.priceUnit} disabled={!fixed} onChange={(e) => onChange({ ...value, priceUnit: e.target.value as PriceUnit })} className={field} name="priceUnit">
          <option value="PER_REQUEST">للطلب كاملًا</option>
          <option value="PER_TRAVELER">لكل مسافر</option>
        </select>
      </label>
      <label className="flex items-center gap-2 self-end text-sm font-bold">
        <input type="checkbox" disabled={!fixed} checked={value.paymentAfterDocumentReview} onChange={(e) => onChange({ ...value, paymentAfterDocumentReview: e.target.checked })} name="paymentAfterDocumentReview" />
        الدفع بعد اعتماد المستندات
      </label>
      <p className="col-span-full text-xs text-muted-foreground">
        {fixed
          ? "يرى العميل الإجمالي قبل الإرسال ويؤكد طلبه به؛ لا يُصدر عرض سعر ولا تُطلب موافقة ثانية. السعر يجب أن يكون أكبر من صفر."
          : "تراجع الوكالة الطلب وتصدر عرض سعر، ويوافق العميل على الإصدار المعروض له. السعر المعروض في الكتالوج تقديري."}
      </p>
    </fieldset>
  );
}
