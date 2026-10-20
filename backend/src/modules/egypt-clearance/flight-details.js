// Flight details of an Egypt approval request whose traveler already has a
// ticket (intakeData.egyptTravel.flightDetails): what the customer typed,
// or what staff checked against the ticket. Staff verification is recorded
// (who, when); a customer edit clears it, since the checked values changed.
import { z } from "zod";

const time = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "الوقت بصيغة HH:MM");
const blankToUndefined = (schema) => z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const flightDetailsFields = {
  flightNumber: blankToUndefined(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,3}\s?\d{1,5}[A-Z]?$/, "رقم الرحلة غير صالح (مثال: SD 345)")),
  airline: blankToUndefined(z.string().trim().min(2).max(80)),
  departureTime: blankToUndefined(time),
  arrivalTime: blankToUndefined(time),
};

export const FLIGHT_DETAIL_KEYS = Object.keys(flightDetailsFields);

// Staff corrections: an empty or null value clears the field (omitted keeps it).
const clearable = (schema) => z.preprocess((value) => (value === "" ? null : value), schema.nullable().optional());
export const staffFlightDetailsFields = {
  flightNumber: clearable(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,3}\s?\d{1,5}[A-Z]?$/, "رقم الرحلة غير صالح (مثال: SD 345)")),
  airline: clearable(z.string().trim().min(2).max(80)),
  departureTime: clearable(time),
  arrivalTime: clearable(time),
};

export function hasFlightDetails(values) {
  return FLIGHT_DETAIL_KEYS.some((key) => values?.[key]);
}

// What the customer gave, as stored: unverified.
export function customerFlightDetails(values) {
  if (!hasFlightDetails(values)) return null;
  const details = {};
  for (const key of FLIGHT_DETAIL_KEYS) details[key] = values[key] || null;
  return { ...details, source: "CUSTOMER", verifiedAt: null, verifiedByUserId: null };
}

// Customer-facing view (no staff ids).
export function publicFlightDetails(details) {
  if (!details) return null;
  const { verifiedByUserId, ...rest } = details;
  return { ...rest, verified: Boolean(details.verifiedAt) };
}
