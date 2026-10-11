// Pricing mode of a request: explicit agency configuration on the chosen
// catalog item (Service / VisaType pricingMode), never inferred from
// basePrice.
//
//  - QUOTE (default): the agency reviews the request and issues a quote; the
//    customer approves that exact version (workflow-policy.js APPROVE_QUOTE).
//  - FIXED: the catalog price is final. The app shows the total before
//    submission and sends the total the customer confirmed; the server
//    recomputes it from the catalog, refuses a mismatch, and records the
//    accepted price as an already-approved Invoice plus a snapshot. There is
//    no second approval stage. With paymentAfterDocumentReview, payment
//    opens once the documents are approved, at the same price.
//
// A FIXED item submitted without a confirmed total (an older app, a form
// that does not show the total) is recorded as a QUOTE request: nothing is
// charged that the customer has not seen; the agency quotes it as before.
import prisma from "../../config/database.js";
import { sdgSnapshot } from "../finance/fx-snapshot.js";

export const PRICING_MODES = Object.freeze(["QUOTE", "FIXED"]);
export const PRICE_UNITS = Object.freeze(["PER_REQUEST", "PER_TRAVELER"]);

const round2 = (value) => Math.round(Number(value) * 100) / 100;

// Admin configuration check: a FIXED item needs a positive price (it is
// the final price the customer accepts). Returns an Arabic message or null.
export function pricingConfigError({ pricingMode, basePrice }) {
  if (pricingMode === "FIXED" && !(Number(basePrice) > 0)) {
    return "السعر الثابت يتطلب سعرًا أكبر من صفر؛ أدخل السعر أو اختر «بعرض سعر من الوكالة».";
  }
  return null;
}

// The pricing in force for a request (null/legacy = QUOTE).
export function requestPricingMode(request) {
  return request?.pricingMode === "FIXED" ? "FIXED" : "QUOTE";
}

// The configuration a catalog item announces to the customer surfaces.
// FIXED with no positive price is not a usable fixed price: QUOTE.
export function catalogPricing(item) {
  const unitPrice = round2(item?.basePrice ?? 0);
  const fixed = item?.pricingMode === "FIXED" && Number.isFinite(unitPrice) && unitPrice > 0;
  return {
    mode: fixed ? "FIXED" : "QUOTE",
    priceUnit: item?.priceUnit === "PER_TRAVELER" ? "PER_TRAVELER" : "PER_REQUEST",
    paymentAfterDocumentReview: fixed && Boolean(item?.paymentAfterDocumentReview),
    unitPrice: fixed ? unitPrice : null,
    currency: item?.currency || "SAR",
  };
}

// Travelers counted for a per-traveler price: the submitted traveler rows,
// else the declared count, else one.
export function billableUnits(pricing, { travelers = 0, travelerCount = 0 } = {}) {
  if (pricing.priceUnit !== "PER_TRAVELER") return 1;
  const count = Math.max(Number(travelers) || 0, Number(travelerCount) || 0);
  return count > 0 ? count : 1;
}

export function fixedTotal(pricing, counts) {
  const units = billableUnits(pricing, counts);
  return { units, total: round2(pricing.unitPrice * units) };
}

const sameAmount = (a, b) => Math.abs(round2(a) - round2(b)) < 0.005;

// Pure decision for a submission, given the catalog item it references.
// Returns { mode: "QUOTE", snapshot } | { mode: "FIXED", snapshot, invoice }
// | { error, details }.
export function decideSubmissionPricing(item, source, { acceptedTotal, acceptedCurrency, travelers, travelerCount }, now = new Date()) {
  const confirmed = acceptedTotal !== undefined && acceptedTotal !== null && acceptedTotal !== "";
  if (!item) {
    return confirmed ? { error: "PRICING_MODE_CHANGED", details: { pricingMode: "QUOTE" } } : { mode: "QUOTE", snapshot: null };
  }
  const pricing = catalogPricing(item);
  const reference = { source, itemId: item.id, itemCode: item.code || null, itemName: item.name || null };
  if (pricing.mode !== "FIXED") {
    // The customer was shown a fixed total, but the agency has since moved
    // this item to quotation: do not record a price they did not get.
    if (confirmed) return { error: "PRICING_MODE_CHANGED", details: { pricingMode: "QUOTE" } };
    return { mode: "QUOTE", snapshot: null };
  }
  const { units, total } = fixedTotal(pricing, { travelers, travelerCount });
  if (!confirmed) {
    return {
      mode: "QUOTE",
      snapshot: { mode: "QUOTE", reason: "FIXED_PRICE_NOT_CONFIRMED", ...reference, catalogUnitPrice: pricing.unitPrice, priceUnit: pricing.priceUnit, currency: pricing.currency },
    };
  }
  const currency = pricing.currency;
  // A confirmed fixed total must also confirm its currency. An omitted
  // currency cannot mean acceptance of whichever one the agency now uses.
  if (!sameAmount(acceptedTotal, total) || acceptedCurrency !== currency) {
    return { error: "PRICE_CHANGED", details: { pricingMode: "FIXED", total, currency, unitPrice: pricing.unitPrice, priceUnit: pricing.priceUnit, units } };
  }
  const snapshot = {
    mode: "FIXED",
    ...reference,
    unitPrice: pricing.unitPrice,
    priceUnit: pricing.priceUnit,
    units,
    total,
    currency,
    paymentAfterDocumentReview: pricing.paymentAfterDocumentReview,
    acceptedAt: now.toISOString(),
  };
  return { mode: "FIXED", snapshot };
}

// Loads the referenced item (visa type first: its own configuration
// applies) and decides. Adds the approved invoice data for FIXED.
export async function resolveSubmissionPricing(data, { travelers = 0 } = {}) {
  let item = null;
  let source = null;
  const select = { id: true, code: true, name: true, basePrice: true, currency: true, pricingMode: true, priceUnit: true, paymentAfterDocumentReview: true, active: true };
  if (data.visaTypeId) {
    item = await prisma.visaType.findUnique({ where: { id: data.visaTypeId }, select });
    source = "VISA_TYPE";
  } else if (data.serviceId) {
    item = await prisma.service.findUnique({ where: { id: data.serviceId }, select });
    source = "SERVICE";
  }
  const decision = decideSubmissionPricing(item && item.active !== false ? item : null, source, {
    acceptedTotal: data.acceptedTotal,
    acceptedCurrency: data.acceptedCurrency,
    travelers,
    travelerCount: data.travelerCount,
  });
  if (decision.mode !== "FIXED") return decision;
  const { total, currency } = decision.snapshot;
  const fx = await sdgSnapshot(currency, total);
  return {
    ...decision,
    invoice: {
      amount: total,
      currency,
      ...fx,
      description: `سعر ثابت من الكتالوج: ${decision.snapshot.itemName || ""}`.trim(),
      status: "APPROVED",
      decidedAt: new Date(decision.snapshot.acceptedAt),
    },
  };
}
