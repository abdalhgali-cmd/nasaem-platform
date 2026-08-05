// Shared, restricted value sets used across multiple validators. Kept out of
// the Prisma schema (both fields stay plain String columns there) to avoid a
// migration; enforcement happens at the API boundary via Zod.

export const ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

// Currencies relevant to the routes this platform actually serves (Saudi
// Arabia / Egypt / Sudan travel services, per frontend/assets/services-data.js).
export const SUPPORTED_CURRENCIES = ["SAR", "USD", "EUR", "EGP", "SDG", "AED", "GBP"];
