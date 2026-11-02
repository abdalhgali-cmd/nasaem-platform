// The customer always reads an Arabic message. The server's own text is kept
// when it is already Arabic; an English or technical one ("Validation failed",
// "Too many requests...") is replaced by a plain Arabic sentence for the status.
const HAS_ARABIC = /[؀-ۿ]/;

const BY_STATUS = {
  400: "البيانات المدخلة غير صحيحة. راجعها وحاول مرة أخرى.",
  401: "انتهت صلاحية الدخول أو التحقق. سجّل الدخول أو أعد التحقق برقم هاتفك.",
  403: "غير مسموح لك بهذا الإجراء.",
  404: "العنصر المطلوب غير موجود.",
  409: "لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للطلب.",
  413: "حجم الملف كبير جدًا.",
  415: "نوع الملف غير مدعوم. ارفع صورة أو ملف PDF.",
  422: "تعذر معالجة البيانات المرسلة. تحقق منها وحاول مرة أخرى.",
  429: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
  500: "حدث خطأ في الخادم. حاول بعد قليل.",
  502: "الخدمة غير متاحة مؤقتًا. حاول بعد قليل.",
  503: "الخدمة غير متاحة مؤقتًا. حاول بعد قليل.",
  504: "استغرق الخادم وقتًا طويلًا في الرد. حاول بعد قليل.",
};

export function arabicErrorMessage(status, message, fallback = "تعذر إكمال العملية، حاول مرة أخرى.") {
  const text = String(message || "").trim();
  if (text && HAS_ARABIC.test(text)) return text;
  if (BY_STATUS[status]) return BY_STATUS[status];
  if (status >= 500) return BY_STATUS[500];
  return fallback;
}
