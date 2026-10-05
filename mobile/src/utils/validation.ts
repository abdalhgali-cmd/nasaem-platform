// Pure validation helpers (no React Native imports) so they can be unit-tested
// with plain Node — see tests/validation.test.ts.

/**
 * Strict calendar date in YYYY-MM-DD form. Rejects impossible dates
 * (2026-02-31, 2026-13-01) that a bare /^\d{4}-\d{2}-\d{2}$/ would accept.
 */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today as YYYY-MM-DD in UTC (comparisons below are date-only). */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type FlightSearchInput = {
  from: string;
  to: string;
  date: string;
  returnDate?: string;
  roundTrip: boolean;
  travelers: string;
};

/** Returns an Arabic error message for the first problem found, or null when valid. */
export function validateFlightSearch(input: FlightSearchInput, now: Date = new Date()): string | null {
  if (!input.from.trim() || !input.to.trim()) return "أدخل مدينة المغادرة والوصول.";
  if (!isIsoDate(input.date)) return "أدخل تاريخ السفر بصيغة YYYY-MM-DD، مثال: 2026-12-31.";
  if (input.date < todayIso(now)) return "تاريخ السفر لا يمكن أن يكون في الماضي.";
  if (input.roundTrip) {
    if (!input.returnDate || !isIsoDate(input.returnDate)) return "أدخل تاريخ العودة بصيغة YYYY-MM-DD.";
    if (input.returnDate < input.date) return "تاريخ العودة يجب أن يكون بعد تاريخ السفر.";
  }
  const travelers = Number(input.travelers);
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 20) return "عدد المسافرين يجب أن يكون بين 1 و20.";
  return null;
}
