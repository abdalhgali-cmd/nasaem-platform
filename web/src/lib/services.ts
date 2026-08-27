import { API_URL } from "./api-url";

export type PublicService = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  iconKey: string | null;
  imageKey: string | null;
};

export async function getPublicServices(): Promise<PublicService[]> {
  try {
    const response = await fetch(`${API_URL}/services/public`, { next: { revalidate: 60 } });
    if (!response.ok) return [];
    const payload = (await response.json()) as { data?: PublicService[] };
    return Array.isArray(payload.data) ? payload.data : [];
  } catch {
    return [];
  }
}
