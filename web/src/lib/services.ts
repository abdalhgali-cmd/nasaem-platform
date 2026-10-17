import { API_URL } from "./api-url";

export type PublicService = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  iconKey: string | null;
  imageKey: string | null;
  basePrice: number | string | null;
  currency: string | null;
  priceSdg: number | null;
  pricingMode: "FIXED" | "QUOTE";
  priceUnit: "PER_REQUEST" | "PER_TRAVELER";
};

export type PublicVisaType = PublicService & {
  country: string;
  serviceId: string | null;
};

export type PublicCatalog = {
  services: PublicService[];
  visaTypes: PublicVisaType[];
  packages: PublicService[];
};

export async function getPublicCatalog(): Promise<PublicCatalog> {
  try {
    const [catalogResponse, packagesResponse] = await Promise.all([
      fetch(`${API_URL}/services/public`, { next: { revalidate: 60 } }),
      fetch(`${API_URL}/services/public/packages`, { next: { revalidate: 60 } }),
    ]);
    const catalogPayload = catalogResponse.ok
      ? ((await catalogResponse.json()) as { data?: { services?: PublicService[]; visaTypes?: PublicVisaType[] } })
      : {};
    const packagesPayload = packagesResponse.ok
      ? ((await packagesResponse.json()) as { data?: PublicService[] })
      : {};

    return {
      services: Array.isArray(catalogPayload.data?.services) ? catalogPayload.data.services : [],
      visaTypes: Array.isArray(catalogPayload.data?.visaTypes) ? catalogPayload.data.visaTypes : [],
      packages: Array.isArray(packagesPayload.data) ? packagesPayload.data : [],
    };
  } catch {
    return { services: [], visaTypes: [], packages: [] };
  }
}

export async function getPublicServices(): Promise<PublicService[]> {
  return (await getPublicCatalog()).services;
}
