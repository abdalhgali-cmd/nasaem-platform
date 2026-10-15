// Every Umrah package asks for the guarantor's residence permit («إقامة
// الضامن») once per request, instead of a personal photo. Existing packages
// got it from migration 20261015100000_umrah_guarantor_residence; a package
// created later (or moved into an Umrah category) inherits it here. Only
// Umrah services are touched; an admin can still edit or deactivate the row
// from the requirements screen afterwards.
export const UMRAH_SERVICE_CATEGORIES = Object.freeze(["umrah", "UMRAH_PACKAGE", "umrah_package"]);
export const GUARANTOR_RESIDENCE_NAME = "إقامة الضامن";

export function isUmrahServiceCategory(category) {
  return UMRAH_SERVICE_CATEGORIES.includes(String(category || ""));
}

// Adds the requirement unless the service already has a guarantor residence
// requirement (active or not: a deliberately deactivated one stays off).
export async function ensureUmrahGuarantorRequirement(db, serviceId) {
  const existing = await db.visaRequirement.findFirst({
    where: { serviceId, name: { contains: GUARANTOR_RESIDENCE_NAME } },
    select: { id: true },
  });
  if (existing) return null;
  return db.visaRequirement.create({
    data: {
      serviceId,
      name: GUARANTOR_RESIDENCE_NAME,
      description: "صورة واضحة لإقامة الضامن في السعودية (صورة أو PDF).",
      required: true,
      attachmentType: "guarantor_residence",
      maxFiles: 1,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      maxSizeBytes: 10 * 1024 * 1024,
      reviewRequired: true,
      ocrEnabled: false,
      sortOrder: 50,
      active: true,
      type: "DOCUMENT",
      scope: "CASE",
    },
  });
}
