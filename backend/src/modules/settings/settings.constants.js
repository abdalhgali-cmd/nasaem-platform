// Well-known Setting keys used by the Umrah request's bank-transfer payment
// step. Shared between settings.service.js (public read) and
// contact-requests.service.js (price calculation) so both sides agree on
// the exact key strings.
export const PAYMENT_SETTING_KEYS = {
  SAR_TO_SDG_RATE: "sar_to_sdg_rate",
  USD_TO_SDG_RATE: "usd_to_sdg_rate",
  BANK_ACCOUNT_SAR: "bank_account_sar",
  BANK_ACCOUNT_SDG: "bank_account_sdg",
  BANK_ACCOUNT_USD: "bank_account_usd",
};
