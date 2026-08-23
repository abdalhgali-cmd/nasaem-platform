import { z } from "zod";

// IATA airport codes are 3 letters (e.g. "JED"); ICAO airport codes are 4
// letters (e.g. "OEJN"). Normalized to uppercase before validation/
// storage — same rationale as the Airline directory's codes.
const iataCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "IATA code must be 3 letters")
  .optional()
  .nullable();

const icaoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, "ICAO code must be 4 letters")
  .optional()
  .nullable();

export const createAirportSchema = z.object({
  nameAr: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().max(150).optional().nullable(),
  cityAr: z.string().trim().min(1).max(100),
  cityEn: z.string().trim().max(100).optional().nullable(),
  countryAr: z.string().trim().min(1).max(100),
  countryEn: z.string().trim().max(100).optional().nullable(),
  iataCode,
  icaoCode,
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  active: z.coerce.boolean().optional(),
});

export const updateAirportSchema = createAirportSchema.partial();

export const searchAirportsSchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
