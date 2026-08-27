import { API_URL } from "@/lib/api-url";

export async function adminRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.message || "تعذر إتمام العملية");
  return payload as T;
}

export function adminAssetUrl(key: string) {
  return `${API_URL}/site-assets/${encodeURIComponent(key)}/file`;
}
