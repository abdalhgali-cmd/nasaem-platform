// Shared, restricted value sets used across multiple validators. Kept out of
// the Prisma schema (both fields stay plain String columns there) to avoid a
// migration; enforcement happens at the API boundary via Zod.

export const ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const VISA_ENTRY_TYPES = ["SINGLE", "MULTIPLE"];

// Currencies relevant to the routes this platform actually serves (Saudi
// Arabia / Egypt / Sudan travel services, per frontend/assets/services-data.js).
export const SUPPORTED_CURRENCIES = ["SAR", "USD", "EUR", "EGP", "SDG", "AED", "GBP"];

// Fixed icon set for anything admin-configurable that shows a small
// symbolic icon (homepage sections, the service catalog, ...). Shared here
// so every module validates against the same allow-list instead of each
// duplicating its own — the frontend's icon-resolution map must be kept in
// sync (web/src/lib/homepage-icons.ts).
export const ICON_KEYS = [
  "ship",
  "landmark",
  "stamp",
  "plane",
  "hotel",
  "globe",
  "package",
  "shield-check",
  "map-pin",
  "file-check",
  "credit-card",
  "users",
  "star",
  "clock",
  "check-circle",
];
