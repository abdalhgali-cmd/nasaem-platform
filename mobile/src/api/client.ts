import Constants from "expo-constants";
import { ApiError, NetworkError, statusMessage } from "../utils/errors";

export { ApiError, NetworkError };

// The API base URL is injected at build time by app.config.ts (per environment:
// development / staging / production). It is never hard-coded here.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined);
if (!API_URL) throw new Error("Missing API URL: set EXPO_PUBLIC_API_URL (see mobile/README.md)");

// Every authenticated call passes its own Authorization header (the customer
// app only ever holds a phone-verified tracking session; there is no staff login
// in this app — staff use the web admin).

const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 90_000; // multipart uploads over slow mobile networks
const RETRY_DELAY_MS = 800;

type Options = { timeoutMs?: number };

async function attempt<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(statusMessage(response.status, payload), response.status, payload);
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError("انتهت مهلة الاتصال. تحقق من الإنترنت ثم حاول مرة أخرى.", "timeout");
    }
    throw new NetworkError("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.", "offline");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * JSON request with a timeout. Reads (GET) are retried once on a network failure
 * (never on an HTTP error response); writes are never retried automatically, so
 * a flaky connection cannot submit the same request twice.
 */
export async function api<T>(path: string, init?: RequestInit, options: Options = {}): Promise<T> {
  const isRead = !init?.method || init.method.toUpperCase() === "GET";
  const isUpload = init?.body instanceof FormData;
  const timeoutMs = options.timeoutMs ?? (isUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  try {
    return await attempt<T>(path, init, timeoutMs);
  } catch (error) {
    if (isRead && error instanceof NetworkError) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return attempt<T>(path, init, timeoutMs);
    }
    throw error;
  }
}

export { API_URL };
