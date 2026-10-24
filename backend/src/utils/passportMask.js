// Passport numbers are shown in full only inside a record's details, to
// staff allowed to open it (AUDIT-00 / owner rule: never in lists). Lists
// show the last three characters, enough to tell two customers apart.
export function maskPassport(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  return `•••${text.slice(-3)}`;
}

// A booking's passenger list without passport numbers.
export function withoutPassportNumbers(passengers) {
  return Array.isArray(passengers) ? passengers.map(({ passportNo, ...rest }) => rest) : passengers;
}
