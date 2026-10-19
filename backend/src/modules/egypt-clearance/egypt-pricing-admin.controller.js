import { z } from "zod";
import prisma from "../../config/database.js";
import { logActivity } from "../../utils/activityLog.js";
import { getCurrencyRates } from "../flights/flights.service.js";
import { refreshStoredFlightPrices } from "../flights/fx-refresh.service.js";
import { ensureEgyptClearanceVariants } from "../../../prisma/setup-egypt-clearance-variants.js";

const AIR = "VISA-EGYPT-CLEARANCE-AIR";
const BORDER = "VISA-EGYPT-CLEARANCE-BORDER";
const CODES = [AIR, BORDER];

// Only authorized administrators may change Egypt prices, activation, and
// the globally shared USD→SDG rate. Prices are PER_TRAVELER, not quotes.
const configSchema = z.object({
  usdRateToSdg: z.number().finite().positive(),
  air: z.object({ priceUsd: z.number().finite().positive(), active: z.boolean() }).strict(),
  border: z.object({ priceUsd: z.number().finite().positive(), active: z.boolean() }).strict(),
}).strict();

async function currentConfig() {
  const [variants, rates] = await Promise.all([
    prisma.visaType.findMany({ where: { code: { in: CODES } } }),
    getCurrencyRates(),
  ]);
  const byCode = Object.fromEntries(variants.map((v) => [v.code, v]));
  const describe = (code) => {
    const v = byCode[code];
    return v
      ? { exists: true, active: v.active, priceUsd: v.currency === "USD" ? Number(v.basePrice) : null,
          currency: v.currency, pricingMode: v.pricingMode, priceUnit: v.priceUnit }
      : { exists: false, active: false, priceUsd: null };
  };
  return { usdRateToSdg: rates.USD, air: describe(AIR), border: describe(BORDER) };
}

export async function getEgyptPricingConfig(req, res, next) {
  try {
    return res.json({ success: true, data: await currentConfig() });
  } catch (error) {
    next(error);
  }
}

export async function saveEgyptPricingConfig(req, res, next) {
  try {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, code: "INVALID_EGYPT_PRICING", message: "أدخل الأسعار وسعر الدولار بأرقام صحيحة أكبر من صفر، وحدد حالة كل خدمة.", errors: parsed.error.flatten() });

    // Creates the required visa types (and copies the passport checklist)
    // only if missing. Existing admin-edited variants are never reset.
    await ensureEgyptClearanceVariants();
    const before = await currentConfig();
    const { usdRateToSdg, air, border } = parsed.data;

    await prisma.$transaction(async (tx) => {
      const exists = await tx.visaType.count({ where: { code: { in: CODES } } });
      if (exists !== 2) {
        const error = new Error("تعذر تهيئة نوعَي الموافقة الأمنية في قاعدة البيانات.");
        error.statusCode = 409;
        throw error;
      }
      const update = (code, desired) => tx.visaType.update({
        where: { code },
        data: {
          basePrice: desired.priceUsd,
          currency: "USD",
          pricingMode: "FIXED",
          priceUnit: "PER_TRAVELER",
          paymentAfterDocumentReview: false,
          active: desired.active,
        },
      });
      await update(AIR, air);
      await update(BORDER, border);
      await tx.setting.upsert({
        where: { key: "FX_USD_SDG" },
        update: { value: String(usdRateToSdg) },
        create: { key: "FX_USD_SDG", value: String(usdRateToSdg) },
      });
    });
    const after = await currentConfig();
    logActivity({
      userId: req.user?.id, action: "EGYPT_PRICING_UPDATED", entity: "VisaType",
      entityId: "EGYPT_CLEARANCE", req, oldValue: before, newValue: after,
    });
    // USD is the shared agency rate. Keep previously stored flight SDG
    // equivalents consistent with it, just as /flights/admin/rates does.
    let refreshWarning = null;
    try {
      await refreshStoredFlightPrices(await getCurrencyRates());
    } catch (error) {
      console.error("Egypt pricing saved, but flight FX refresh failed:", error);
      refreshWarning = "تم حفظ أسعار مصر، لكن تعذّر تحديث أسعار الرحلات المخزنة. راجع تحديث أسعار الصرف.";
    }
    return res.json({ success: true, data: after, ...(refreshWarning ? { warning: refreshWarning } : {}) });
  } catch (error) {
    next(error);
  }
}
