import { api } from "./client";

let trackingToken: string | null = null;

type VerifyResponse = { success: boolean; data?: { token?: string } };
export type TrackedRequest = {
  id: string;
  service?: string | null;
  status?: string;
  createdAt?: string;
  statusLabel?: string;\n  paymentStatus?: string | null;\n  invoice?: { amount?: number | string; currency?: string; status?: string } | null;
  [key: string]: unknown;
};

export async function requestTrackingCode(phone: string) {
  return api<{ success: boolean; message: string; debugCode?: string }>("/api/tracking/request-code", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyTrackingCode(phone: string, code: string) {
  const response = await api<VerifyResponse>("/api/tracking/verify-code", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
  const token = response.data?.token;
  if (!token) throw new Error("لم يتم استلام جلسة التتبع");
  trackingToken = token;
}

function authHeaders() {
  if (!trackingToken) throw new Error("جلسة التتبع غير موجودة");
  return { Authorization: `Bearer ${trackingToken}` };
}

export async function getTrackedRequests() {
  const response = await api<{ success: boolean; data: TrackedRequest[] }>("/api/tracking/requests", {
    headers: authHeaders(),
  });
  return response.data;
}

export async function approveTrackedInvoice(id: string) {
  return api("/api/tracking/requests/" + encodeURIComponent(id) + "/invoice/approve", {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function rejectTrackedInvoice(id: string) {
  return api("/api/tracking/requests/" + encodeURIComponent(id) + "/invoice/reject", {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function markTrackedTransferSent(id: string) {
  return api("/api/tracking/requests/" + encodeURIComponent(id) + "/mark-transfer-sent", {
    method: "POST",
    headers: authHeaders(),
  });
}
