import { api } from "./client";

export type PublicRequirement = {
  id: string;
  name: string;
  nameEn?: string | null;
  description?: string | null;
  required: boolean;
  attachmentType?: string | null;
  maxFiles?: number;
  allowedMimeTypes?: string[];
  maxSizeBytes?: number | null;
  ocrEnabled?: boolean;
  type?: string;
  scope?: string;
  options?: unknown;
  conditionRequirementId?: string | null;
  conditionOperator?: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN" | null;
  conditionValue?: string | null;
};

export type PublicService = {
  id: string;
  code?: string;
  slug?: string;
  name?: string;
  nameAr?: string;
  title?: string;
  category?: string | null;
  description?: string | null;
  basePrice?: number | string | null;
  currency?: string | null;
  priceSdg?: number | null;
  fxRateToSdg?: number | null;
  iconKey?: string | null;
  processingTime?: string | null;
  features?: unknown;
};

export type PublicVisaType = {
  id: string;
  code?: string;
  name: string;
  nameEn?: string | null;
  country: string;
  description?: string | null;
  basePrice?: number | string | null;
  currency?: string | null;
  priceSdg?: number | null;
  fxRateToSdg?: number | null;
  serviceId?: string | null;
  type?: string | null;
  processingTime?: string | null;
  stayDuration?: string | null;
  validity?: string | null;
  entryType?: string | null;
  category?: string | null;
};

type PublicCatalogResponse = {
  success: boolean;
  data: { services: PublicService[]; visaTypes: PublicVisaType[] };
};

export async function getPublicCatalog() {
  const payload = await api<PublicCatalogResponse>("/api/services/public");
  return payload.data;
}

export async function getPublicServices(): Promise<PublicService[]> {
  return (await getPublicCatalog()).services;
}

export async function getPublicVisaTypes(): Promise<PublicVisaType[]> {
  return (await getPublicCatalog()).visaTypes;
}

export async function getPublicPackages(): Promise<PublicService[]> {
  const payload = await api<{ success: boolean; data: PublicService[] }>("/api/services/public/packages");
  return payload.data;
}

export async function getServiceRequirements(serviceId: string): Promise<PublicRequirement[]> {
  const payload = await api<{ success: boolean; data: PublicRequirement[] }>(`/api/services/${encodeURIComponent(serviceId)}/requirements/public`);
  return payload.data;
}

export async function getVisaRequirements(visaTypeId: string): Promise<PublicRequirement[]> {
  const payload = await api<{ success: boolean; data: PublicRequirement[] }>(`/api/visa-types/${encodeURIComponent(visaTypeId)}/requirements/public`);
  return payload.data;
}
