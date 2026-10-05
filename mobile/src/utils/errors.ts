// Turns whatever a request threw into one clear Arabic message for the user.
// Kept free of React Native imports so it can be unit-tested with plain Node.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly kind: "offline" | "timeout"
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

/** The server's own user-facing message, when it sent one (validation, business rules). */
export function serverMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

/** Arabic message for an HTTP failure; prefers the server's own message when it sent one. */
export function statusMessage(status: number, payload: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string {
  if (status === 401) return "انتهت جلسة الدخول. سجّل الدخول مرة أخرى.";
  if (status === 403) return "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
  if (status === 404) return serverMessage(payload) ?? "لم يتم العثور على المطلوب.";
  if (status === 413) return "حجم الملف كبير. الحد الأقصى 10 ميغابايت.";
  if (status === 429) return "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.";
  if (status >= 500) return "الخدمة غير متاحة مؤقتًا. حاول بعد قليل.";
  return serverMessage(payload) ?? fallback;
}

export function friendlyError(error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) return error.message || statusMessage(error.status, error.payload, fallback);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
