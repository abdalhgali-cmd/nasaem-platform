import { PROVIDER_MODES, getProviderAdapter, providerStatus } from "./provider-registry.js";
import { ProviderError } from "./provider-errors.js";

const CONFIRM_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const PNR_PATTERN = /^[A-Z0-9]{5,8}$/;

// The only way a provider booking (PNR) can be made. In order:
//  1. the provider must be LIVE (reviewed adapter + credentials + owner
//     approval) — otherwise the booking stays a manual staff booking;
//  2. only an admin may confirm;
//  3. the offer must still be within its validity time;
//  4. the provider re-prices it: unavailable or a different total stops
//     here — the customer must accept the new price first;
//  5. the PNR is accepted only if the provider actually returned one.
// Nothing is issued or charged here; ticket issuance stays a separate step.
export async function confirmProviderBooking({ offer, passengers, actor, now = new Date(), env = process.env }) {
  const status = providerStatus(offer?.provider, env);
  if (!status || status.mode !== PROVIDER_MODES.LIVE) {
    return { outcome: "REQUEST_ONLY", reason: status?.reason ?? "UNKNOWN_PROVIDER" };
  }
  if (!actor || !CONFIRM_ROLES.has(actor.role)) throw new ProviderError("FORBIDDEN");
  if (!offer.validUntil || new Date(offer.validUntil) <= now) throw new ProviderError("FARE_EXPIRED");

  const adapter = getProviderAdapter(offer.provider);
  const repriced = await adapter.reprice(offer);
  if (!repriced?.available) throw new ProviderError("FARE_UNAVAILABLE");
  if (repriced.currency !== offer.currency || Number(repriced.total) !== Number(offer.total)) {
    const error = new ProviderError("PRICE_CHANGED");
    error.newPrice = { total: Number(repriced.total), currency: repriced.currency };
    throw error;
  }

  const result = await adapter.createPnr(offer, passengers);
  const pnr = String(result?.pnr ?? "").trim().toUpperCase();
  if (!PNR_PATTERN.test(pnr)) throw new ProviderError("PNR_FAILED");
  return { outcome: "PNR_CREATED", pnr, provider: offer.provider, total: offer.total, currency: offer.currency };
}
