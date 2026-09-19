import { api } from "./client";

export type PublicService = {
  id: string | number;
  slug?: string;
  name?: string;
  nameAr?: string;
  title?: string;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
  category?: string | null;
};

function unwrapList(payload: unknown): PublicService[] {
  if (Array.isArray(payload)) return payload as PublicService[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["services", "data", "items"]) {
      if (Array.isArray(record[key])) return record[key] as PublicService[];
    }
  }
  return [];
}

export async function getPublicServices(): Promise<PublicService[]> {
  return unwrapList(await api<unknown>("/api/services/public"));
}

export async function getPublicPackages(): Promise<PublicService[]> {
  return unwrapList(await api<unknown>("/api/packages"));
}
