import { logActivity } from "../../utils/activityLog.js";
import { getCurrencyRates, updateCurrencyRates } from "./flights.service.js";
import { refreshStoredFlightPrices } from "./fx-refresh.service.js";

export async function patchRatesAndRefresh(req, res, next) {
  try {
    const before = await getCurrencyRates();
    const rates = await updateCurrencyRates(req.body || {});
    logActivity({ userId: req.user?.id, action: "FX_RATES_UPDATED", entity: "Setting", entityId: "FX_RATES", req, oldValue: before, newValue: rates });
    await refreshStoredFlightPrices(rates);
    res.json({ success: true, data: await getCurrencyRates() });
  } catch (error) {
    next(error);
  }
}
