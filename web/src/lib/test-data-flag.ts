import { API_URL } from "@/lib/api-url";

// Whether the API serves development/test prices (/health → pricesAreTestData).
// Read on the server so the customer strip is part of the first paint and does
// not push the page down after load. null = unknown (the browser asks again).
export async function getTestDataFlag(): Promise<boolean | null> {
  try {
    const response = await fetch(`${API_URL}/health`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.pricesAreTestData === true;
  } catch {
    return null;
  }
}
