import { api } from "./client";

export type ContactRequestInput = {
  name: string;
  phone: string;
  email?: string;
  service: string;
  message: string;
  serviceId?: string;
  visaTypeId?: string;
  travelerCount?: number;
  intakeData?: Record<string, unknown>;
  answers?: Record<string, string | number | boolean>;
  travelers?: {
    fullName: string;
    passportNo?: string;
    nationality?: string;
    birthDate?: string;
    gender?: "MALE" | "FEMALE" | "OTHER";
    isPrimary?: boolean;
  }[];
};

export type UploadAsset = {
  uri: string;
  name: string;
  mimeType?: string | null;
  label: string;
  travelerIndex?: number;
  requirementId?: string;
};

type CreateResponse = { success: boolean; data: { id: string } };

export async function submitContactRequest(input: ContactRequestInput) {
  const response = await api<CreateResponse>("/api/contact-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data.id;
}

export async function submitContactRequestWithDocuments(input: ContactRequestInput, documents: UploadAsset[]) {
  const body = new FormData();
  body.append("name", input.name);
  body.append("phone", input.phone);
  if (input.email) body.append("email", input.email);
  body.append("service", input.service);
  body.append("message", input.message);
  if (input.serviceId) body.append("serviceId", input.serviceId);
  if (input.visaTypeId) body.append("visaTypeId", input.visaTypeId);
  if (input.travelerCount) body.append("travelerCount", String(input.travelerCount));
  if (input.intakeData) body.append("intakeData", JSON.stringify(input.intakeData));
  if (input.answers && Object.keys(input.answers).length) body.append("answers", JSON.stringify(input.answers));
  if (input.travelers?.length) body.append("travelers", JSON.stringify(input.travelers));

  body.append("documentLabels", JSON.stringify(documents.map(d => d.label)));
  body.append("documentRequirementIds", JSON.stringify(documents.map(d => d.requirementId ?? "")));
  body.append("documentTravelerIndexes", JSON.stringify(documents.map(d => d.travelerIndex == null ? "" : String(d.travelerIndex))));

  for (const doc of documents) {
    body.append("documents", {
      uri: doc.uri,
      name: doc.name,
      type: doc.mimeType || "application/octet-stream",
    } as unknown as Blob);
  }

  const response = await api<CreateResponse>("/api/contact-requests", {
    method: "POST",
    body,
  });
  return response.data.id;
}
