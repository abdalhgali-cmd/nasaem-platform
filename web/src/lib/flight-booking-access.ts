import { API_URL } from "@/lib/api-url";

// Customer access to a public flight booking is by:
//   * the booking's access token (returned once when the booking is created;
//     kept in sessionStorage and in the follow-up link's #fragment, which is
//     never sent to a server or written to an access log), or
//   * a phone-verified session (WhatsApp one-time code) for the booking's phone.
// The phone number itself is never a credential and is never put in a URL.

export type BookingCredential = { token?: string; bearer?: string };

const storageKey = (number: string) => `nasaem.flightBooking.${number}`;

export function rememberBookingToken(number: string, token: string) {
  try {
    sessionStorage.setItem(storageKey(number), token);
  } catch {
    /* storage unavailable (private mode) — the follow-up link still carries the token */
  }
}

export function recallBookingToken(number: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(number));
  } catch {
    return null;
  }
}

function authHeaders(credential: BookingCredential): Record<string, string> {
  if (credential.token) return { "X-Booking-Token": credential.token };
  if (credential.bearer) return { Authorization: `Bearer ${credential.bearer}` };
  return {};
}

async function parse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "تعذر إكمال الطلب");
  return payload;
}

export async function fetchPublicBooking(number: string, credential: BookingCredential) {
  const response = await fetch(`${API_URL}/flight-bookings/public/${encodeURIComponent(number)}`, { headers: authHeaders(credential) });
  return (await parse(response)).booking;
}

export async function uploadBookingReceipt(number: string, file: File, credential: BookingCredential) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_URL}/flight-bookings/${encodeURIComponent(number)}/payment-receipt`, { method: "POST", headers: authHeaders(credential), body: form });
  return (await parse(response)).booking;
}

// Files are fetched with the credential in a header and saved from a blob:
// a plain <a href> cannot carry a header, and putting the credential in the URL
// would leak it into history and logs.
export async function downloadBookingFile(number: string, kind: "provisional" | "final" | "receipt", credential: BookingCredential) {
  const response = await fetch(`${API_URL}/flight-bookings/${encodeURIComponent(number)}/file/${kind}`, { headers: authHeaders(credential) });
  if (!response.ok) throw new Error("تعذر تحميل الملف");
  const blob = await response.blob();
  const extension = blob.type === "application/pdf" ? "pdf" : blob.type.split("/")[1] || "bin";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${number}-${kind}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function requestBookingOtp(phone: string) {
  const response = await fetch(`${API_URL}/tracking/request-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
  await parse(response);
}

export async function verifyBookingOtp(phone: string, code: string): Promise<string> {
  const response = await fetch(`${API_URL}/tracking/verify-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code }) });
  const token = (await parse(response))?.data?.token;
  if (!token) throw new Error("تعذر التحقق من الرمز");
  return token;
}
