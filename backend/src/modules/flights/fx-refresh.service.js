import prisma from "../../config/database.js";

const FX_KEYS = { USD: "FX_USD_SDG", SAR: "FX_SAR_SDG", AED: "FX_AED_SDG", EGP: "FX_EGP_SDG" };

export async function refreshStoredFlightPrices(rates) {
  const entries = Object.entries(FX_KEYS);
  for (const [currency] of entries) {
    const rate = Number(rates[currency] ?? 0);
    if (!rate) {
      await prisma.$executeRawUnsafe(
        `UPDATE flight_inventory SET fx_rate_to_sdg = NULL, price_sdg = NULL, updated_at = CURRENT_TIMESTAMP WHERE currency = $1`,
        currency,
      );
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE flight_inventory SET fx_rate_to_sdg = $1, price_sdg = price * $1, updated_at = CURRENT_TIMESTAMP WHERE currency = $2`,
      rate,
      currency,
    );
  }
  await prisma.$executeRawUnsafe(
    `UPDATE flight_inventory SET fx_rate_to_sdg = 1, price_sdg = price, updated_at = CURRENT_TIMESTAMP WHERE currency = 'SDG'`,
  );
}
