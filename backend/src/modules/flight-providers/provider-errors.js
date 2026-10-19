// Errors a provider call can end in. Messages are fixed Arabic text for
// staff: never the provider's response body, the request, credentials or
// passenger data.
export const PROVIDER_ERROR_MESSAGES = {
  PROVIDER_TIMEOUT: "لم يرد مزود الطيران في الوقت المحدد.",
  PROVIDER_RATE_LIMITED: "مزود الطيران رفض الطلب مؤقتًا لكثرة الطلبات.",
  PROVIDER_UNAVAILABLE: "مزود الطيران غير متاح حاليًا.",
  PROVIDER_AUTH_FAILED: "رفض مزود الطيران بيانات الاعتماد.",
  PROVIDER_BAD_RESPONSE: "رد مزود الطيران غير صالح.",
  FARE_EXPIRED: "انتهت صلاحية السعر؛ يلزم بحث جديد.",
  FARE_UNAVAILABLE: "لم تعد الرحلة متاحة بهذا السعر.",
  PRICE_CHANGED: "تغير السعر لدى المزود؛ يلزم تأكيد العميل للسعر الجديد.",
  PNR_FAILED: "لم يُصدر المزود رقم حجز صالحًا.",
  NOT_LIVE: "هذا المزود غير مفعّل للحجز المباشر؛ الحجز يتم يدويًا.",
  FORBIDDEN: "لا تملك صلاحية تأكيد الحجز لدى المزود.",
};

export class ProviderError extends Error {
  constructor(code, { retryAfterSeconds = null, status = null } = {}) {
    super(PROVIDER_ERROR_MESSAGES[code] || PROVIDER_ERROR_MESSAGES.PROVIDER_BAD_RESPONSE);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.providerStatus = status;
  }
}
