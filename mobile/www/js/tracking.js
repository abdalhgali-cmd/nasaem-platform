// A second, independent session on top of the customer-account one: price
// approval, payment-receipt upload and the Egypt travel/circular follow-up
// live under the backend's /api/tracking routes (contact-request-tracking
// module), which authenticate by phone + WhatsApp OTP rather than the
// account password — the same mechanism a guest who never created an
// account uses. A logged-in customer still has to pass this phone check
// once per request to reach those specific actions; this module makes that
// a short in-place step instead of a dead end.
import { api, apiUpload } from "./api.js";
import { getItem, setItem, removeItem } from "./storage.js";

const TRACKING_TOKEN_KEY = "nasaem.tracking.token";
let cachedToken = null;

async function getTrackingToken() {
  if (cachedToken !== null) return cachedToken;
  cachedToken = await getItem(TRACKING_TOKEN_KEY);
  return cachedToken;
}

export async function hasTrackingSession() {
  return Boolean(await getTrackingToken());
}

export async function requestTrackingCode(phone) {
  return api("/tracking/request-code", { method: "POST", body: JSON.stringify({ phone }) });
}

export async function verifyTrackingCode(phone, code) {
  const res = await api("/tracking/verify-code", { method: "POST", body: JSON.stringify({ phone, code }) });
  cachedToken = res.data?.token || null;
  if (cachedToken) await setItem(TRACKING_TOKEN_KEY, cachedToken);
  return res;
}

export async function clearTrackingSession() {
  cachedToken = null;
  await removeItem(TRACKING_TOKEN_KEY);
}

async function trackingHeaders() {
  const token = await getTrackingToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function approveInvoice(requestId) {
  return api(`/tracking/requests/${requestId}/invoice/approve`, { method: "POST", headers: await trackingHeaders() });
}

export async function rejectInvoice(requestId) {
  return api(`/tracking/requests/${requestId}/invoice/reject`, { method: "POST", headers: await trackingHeaders() });
}

export async function getPaymentAccounts(currency) {
  return api(`/tracking/payment-accounts?currency=${encodeURIComponent(currency || "SAR")}`, { headers: await trackingHeaders() });
}

export async function markTransferSent(requestId) {
  return api(`/tracking/requests/${requestId}/mark-transfer-sent`, { method: "POST", headers: await trackingHeaders() });
}

export async function selectOffer(requestId, offerId) {
  return api(`/tracking/requests/${requestId}/offers/${offerId}/select`, { method: "POST", headers: await trackingHeaders() });
}

export async function uploadPaymentReceipt(requestId, file, onProgress) {
  const form = new FormData();
  form.append("file", file);
  form.append("label", "إثبات الدفع");
  return trackingUpload(`/tracking/requests/${requestId}/payment-receipt`, form, onProgress);
}

export async function saveEgyptTravelPlan(requestId, { entryMode, bookingStatus, entryDate }, file, onProgress) {
  const form = new FormData();
  form.set("entryMode", entryMode);
  form.set("bookingStatus", bookingStatus);
  form.set("entryDate", entryDate);
  if (file) form.append("file", file);
  return trackingUpload(`/tracking/requests/${requestId}/egypt-travel-plan`, form, onProgress);
}

async function trackingUpload(path, form, onProgress) {
  const token = await getTrackingToken();
  return apiUpload(path, form, onProgress, token ? { Authorization: `Bearer ${token}` } : {});
}
