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
  travelers?: Array<{
    fullName: string;
    passportNo?: string;
    nationality?: string;
    birthDate?: string;
    gender?: "MALE" | "FEMALE" | "OTHER";
    isPrimary?: boolean;
  }>;
};

type CreateResponse = { success: boolean; data: { id: string } };

export async function submitContactRequest(input: ContactRequestInput) {
  const response = await api<CreateResponse>("/api/contact-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data.id;
}
