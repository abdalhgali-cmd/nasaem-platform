import { ProviderError } from "./provider-errors.js";

// The one HTTP path for provider adapters: a hard timeout, rate-limit and
// auth mapping, and errors that carry only a code — the response body is
// read for JSON, never echoed into an error or a log.
export async function providerRequest({ url, token, timeoutMs = 15_000 }, path, body, { fetchImpl = fetch } = {}) {
  if (!url || !token) throw new ProviderError("NOT_LIVE");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(new URL(path, url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new ProviderError("PROVIDER_TIMEOUT");
    throw new ProviderError("PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new ProviderError("PROVIDER_RATE_LIMITED", { retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null, status: 429 });
  }
  if (response.status === 401 || response.status === 403) throw new ProviderError("PROVIDER_AUTH_FAILED", { status: response.status });
  if (response.status >= 500) throw new ProviderError("PROVIDER_UNAVAILABLE", { status: response.status });
  if (!response.ok) throw new ProviderError("PROVIDER_BAD_RESPONSE", { status: response.status });

  try {
    return await response.json();
  } catch {
    throw new ProviderError("PROVIDER_BAD_RESPONSE", { status: response.status });
  }
}
