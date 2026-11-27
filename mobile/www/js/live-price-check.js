// Compare only authoritative service IDs from a freshly fetched public catalog.
// This is an additional client guard: the server still recomputes totals and
// rejects races or tampered acceptedTotal values atomically.
import { fixedPricing } from "./pricing-view.js";
import { isUmrahPackage } from "./umrah-view.js";

export function findFreshPricedItem(item, { catalog = null, packages = null } = {}) {
  if (!item?.id) return null;
  const items = isUmrahPackage(item)
    ? (Array.isArray(packages) ? packages : [])
    : [...(catalog?.services || []), ...(catalog?.visaTypes || [])];
  return items.find((candidate) => candidate?.id === item.id &&
    (!item.code || candidate.code === item.code) &&
    Boolean(candidate.isVisaType) === Boolean(item.isVisaType)) || null;
}

export function assessLiveFixedPrice(previous, latest) {
  const current = fixedPricing(previous);
  const fresh = fixedPricing(latest);
  if (!fresh || !latest || latest.active === false) return { status: "UNAVAILABLE" };
  if (!current ||
      fresh.unitPrice !== current.unitPrice ||
      fresh.currency !== current.currency ||
      fresh.priceUnit !== current.priceUnit ||
      fresh.paymentAfterDocumentReview !== current.paymentAfterDocumentReview) {
    return { status: "CHANGED", item: latest };
  }
  return { status: "CURRENT", item: latest };
}
