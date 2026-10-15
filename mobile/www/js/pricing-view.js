// The pricing mode a catalog item announces (set explicitly by the agency:
// backend contact-request-pricing/fixed-price.js) and the total the
// customer confirms on the review step. Pure, unit-tested without a DOM.
//
// FIXED: the catalog price is final. The app shows the total and sends it
// back with the order (acceptedTotal); the server recomputes it and refuses
// a mismatch. There is no later price approval.
// QUOTE (default, and whenever the item says nothing): the agency quotes
// after review and the customer approves that exact version.

const round2 = (value) => Math.round(Number(value) * 100) / 100;
const NUMBER = new Intl.NumberFormat("ar", { maximumFractionDigits: 2 });

export function fixedPricing(item) {
  const unitPrice = round2(item?.basePrice ?? 0);
  if (item?.pricingMode !== "FIXED" || !(unitPrice > 0)) return null;
  return {
    unitPrice,
    currency: item.currency || "SAR",
    priceUnit: item.priceUnit === "PER_TRAVELER" ? "PER_TRAVELER" : "PER_REQUEST",
    paymentAfterDocumentReview: Boolean(item.paymentAfterDocumentReview),
    // The agency's active exchange rate for this currency (null without one —
    // the SDG equivalent is then not shown, never estimated).
    fxRateToSdg: Number(item.fxRateToSdg) > 0 ? Number(item.fxRateToSdg) : null,
  };
}

export function fixedTotal(pricing, travelerCount) {
  const units = pricing.priceUnit === "PER_TRAVELER" ? Math.max(1, Number(travelerCount) || 1) : 1;
  return { units, total: round2(pricing.unitPrice * units) };
}

export function moneyText(amount, currency) {
  return `${NUMBER.format(amount)} ${currency}`;
}

// The lines of the total review: what is charged and when it is paid.
export function fixedTotalSummary(pricing, travelerCount) {
  const { units, total } = fixedTotal(pricing, travelerCount);
  const breakdown =
    pricing.priceUnit === "PER_TRAVELER"
      ? `${moneyText(pricing.unitPrice, pricing.currency)} × ${NUMBER.format(units)} ${units === 1 ? "مسافر" : "مسافرين"}`
      : "سعر ثابت للطلب";
  const payment = pricing.paymentAfterDocumentReview
    ? "يُفتح الدفع بعد اعتماد الوكالة لمستنداتك، بهذا الإجمالي نفسه."
    : "بعد تأكيد الطلب تظهر لك تعليمات التحويل مباشرة لرفع إيصال الدفع.";
  const sdgText =
    pricing.currency === "SDG"
      ? ""
      : pricing.fxRateToSdg
        ? `ما يعادل ${moneyText(Math.round(total * pricing.fxRateToSdg), "SDG")} بسعر الصرف المعتمد من الوكالة`
        : "المقابل بالجنيه السوداني غير متاح حاليًا؛ الدفع بالعملة الظاهرة.";
  return { units, total, totalText: moneyText(total, pricing.currency), breakdown, payment, currency: pricing.currency, sdgText };
}

// After a PRICE_CHANGED refusal: the item with the agency's current unit
// price, so the review shows the new total for a fresh confirmation.
export function withServerPrice(item, details) {
  if (!details || !(Number(details.unitPrice) > 0)) return item;
  const currencyChanged = Boolean(details.currency) && details.currency !== item.currency;
  return {
    ...item,
    basePrice: details.unitPrice,
    priceUnit: details.priceUnit || item.priceUnit,
    currency: details.currency || item.currency,
    // A rate for another currency would mislabel the new total.
    ...(currencyChanged ? { fxRateToSdg: null } : {}),
  };
}
