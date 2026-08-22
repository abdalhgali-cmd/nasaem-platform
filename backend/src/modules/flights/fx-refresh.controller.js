import { getCurrencyRates, updateCurrencyRates } from "./flights.service.js";
import { refreshStoredFlightPrices } from "./fx-refresh.service.js";

export async function patchRatesAndRefresh(req, res, next) {
  try {
    const rates = await updateCurrencyRates(req.body || {});
    await refreshStoredFlightPrices(rates);
    res.json({ success: true, data: await getCurrencyRates() });
  } catch (error) {
    next(error);
  }
}
