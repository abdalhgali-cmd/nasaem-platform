// Passport numbers are shown in full only inside a record's details, to
// staff allowed to open it (AUDIT-00 / owner rule: never in lists). Lists
// show the last three characters, enough to tell two customers apart.
export function maskPassport(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  return `•••${text.slice(-3)}`;
}

// A list row whose embedded customer's passport is masked.
export function withMaskedCustomer(row) {
  return row?.customer ? { ...row, customer: { ...row.customer, passportNo: maskPassport(row.customer.passportNo) } } : row;
}

// A request's travelers with masked passport numbers (for lists).
export function withMaskedTravelers(row) {
  return Array.isArray(row?.travelers) ? { ...row, travelers: row.travelers.map((t) => ({ ...t, passportNo: maskPassport(t.passportNo) })) } : row;
}

// A booking's passenger list without passport numbers.
export function withoutPassportNumbers(passengers) {
  return Array.isArray(passengers) ? passengers.map(({ passportNo, ...rest }) => rest) : passengers;
}
