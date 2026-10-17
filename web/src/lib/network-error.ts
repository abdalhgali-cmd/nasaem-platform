// fetch() rejects with a TypeError when the connection drops (offline, reset,
// timeout) — the browser's own English text («Failed to fetch») must never
// reach the customer. A request may still have reached the server, so the
// message says retrying is safe (submissions carry a submissionKey and the
// server returns the same request for a retry).
export const NETWORK_ERROR_MESSAGE =
  "انقطع الاتصال قبل وصول الرد. تحقق من الإنترنت ثم أعد المحاولة؛ لن يُرسل طلبك مرتين.";

export function isNetworkError(error: unknown) {
  return error instanceof TypeError;
}

export function customerErrorMessage(error: unknown, fallback: string) {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE;
  return error instanceof Error && error.message ? error.message : fallback;
}
