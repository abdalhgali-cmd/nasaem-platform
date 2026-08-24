import { z } from "zod";

// IATA airline codes are 2 characters (letters and/or digits, e.g. "SV",
// "9W"); ICAO airline codes are 3 letters (e.g. "SVA"). Normalized to
// uppercase before validation/storage so "sv" and "SV" are treated as the
// same code — this is what "normalize and prevent duplicate codes" means
// in practice, on top of the DB-level unique constraint.
const iataCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2}$/, "IATA code must be 2 letters/digits")
  .optional()
  .nullable();

const icaoCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "ICAO code must be 3 letters")
  .optional()
  .nullable();

export const createAirlineSchema = z.object({
  name: z.string().trim().min(1).max(150),
  nameEn: z.string().trim().max(150).optional().nullable(),
  iataCode,
  icaoCode,
  website: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().url().max(300).optional().nullable()
  ),
  active: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const updateAirlineSchema = createAirlineSchema.partial();
