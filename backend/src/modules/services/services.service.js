import prisma from "../../config/database.js";
import { buildPaginationMeta } from "../../utils/pagination.js";
import { getCurrencyRates } from "../flights/flights.service.js";

async function withSdgEquivalent(items) {
  const rates = await getCurrencyRates();
  return items.map((item) => {
    const currency = String(item.currency || "SDG").toUpperCase();
    const fxRateToSdg = currency === "SDG" ? 1 : Number(rates[currency] || 0) || null;
    return {
      ...item,
      fxRateToSdg,
      priceSdg: fxRateToSdg ? Number(item.basePrice) * fxRateToSdg : null,
    };
  });
}

export async function listServices({ page, limit, skip }) {
  const [data, total] = await Promise.all([
    prisma.service.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.service.count(),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getServiceById(id) {
  return prisma.service.findUnique({ where: { id } });
}

// Backs the public Service Intake wizard (web/): active services + visa
// types only, with a narrow field set (no internal metadata like
// createdAt) — deliberately not the same shape as the staff listServices()
// above, which is auth-gated and returns full rows. updatedAt IS exposed
// (unlike createdAt) because it doubles as the cache-busting version for
// this service's hero/motion media URLs (see web/src/lib/service-hero-
// media.ts) — deriving it from this same already-fetched record, instead of
// a second call to the independently-cached /site-assets list, is what
// keeps a fresh upload from racing two separate revalidate windows.
const PUBLIC_SERVICE_SELECT = {
  id: true,
  code: true,
  name: true,
  updatedAt: true,
  category: true,
  description: true,
  basePrice: true,
  currency: true,
  iconKey: true,
  imageKey: true,
  heroImageKey: true,
  heroImageMobileKey: true,
  motionEnabled: true,
  motionVideoKey: true,
  features: true,
  processingTime: true,
};

const PUBLIC_VISA_TYPE_SELECT = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  country: true,
  description: true,
  basePrice: true,
  currency: true,
  serviceId: true,
  type: true,
  processingTime: true,
  stayDuration: true,
  validity: true,
  entryType: true,
  category: true,
};

// visaCategory (VISA_TYPE_CATEGORIES — INTERNATIONAL/UMRAH/FAMILY_VISIT/
// OTHER) narrows the visaTypes half of the catalog server-side, e.g. the
// public "International Visas" section requests only
// ?visaCategory=INTERNATIONAL so Umrah/Family Visit visa types are never
// present in the response to begin with — no frontend filtering involved.
// `services` is unaffected; it has its own, unrelated `category` field.
export async function listPublicPackages() {
  const packages = await prisma.service.findMany({
    // Keep legacy production packages visible while the dedicated
    // UMRAH_PACKAGE catalog is populated through the admin manager.
    where: { active: true, category: { in: ["package", "UMRAH_PACKAGE"] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: PUBLIC_SERVICE_SELECT,
  });
  return withSdgEquivalent(packages);
}

export async function listPublicCatalog({ visaCategory } = {}) {
  const [services, visaTypes] = await Promise.all([
    prisma.service.findMany({
      where: { active: true, category: { not: "UMRAH_PACKAGE" } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: PUBLIC_SERVICE_SELECT,
    }),
    prisma.visaType.findMany({
      where: { active: true, ...(visaCategory ? { category: visaCategory } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: PUBLIC_VISA_TYPE_SELECT,
    }),
  ]);

  const [pricedServices, pricedVisaTypes] = await Promise.all([
    withSdgEquivalent(services),
    withSdgEquivalent(visaTypes),
  ]);
  return { services: pricedServices, visaTypes: pricedVisaTypes };
}

export async function createService(data) {
  return prisma.service.create({
    data: {
      code: data.code,
      name: data.name,
      category: data.category,
      description: data.description || null,
      basePrice: data.basePrice,
      currency: data.currency || "SAR",
      active: typeof data.active === "boolean" ? data.active : true,
      sortOrder: data.sortOrder ?? 0,
      iconKey: data.iconKey || null,
      motionEnabled: typeof data.motionEnabled === "boolean" ? data.motionEnabled : false,
      features: data.features ?? undefined,
      processingTime: data.processingTime || null,
    },
  });
}

export async function updateService(id, data) {
  const existing = await prisma.service.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.service.update({
    where: { id },
    data,
  });
}

export async function deleteService(id) {
  const existing = await prisma.service.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  // Services referenced by existing order items are protected at the DB
  // level (onDelete: Restrict on OrderItem.service) — deactivate instead of
  // deleting if a service has ever been used in an order.
  const usageCount = await prisma.orderItem.count({ where: { serviceId: id } });

  if (usageCount > 0) {
    return prisma.service.update({ where: { id }, data: { active: false } });
  }

  await prisma.service.delete({ where: { id } });
  return existing;
}

export async function setServiceImageKey(id, imageKey) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.service.update({ where: { id }, data: { imageKey } });
}

// Shared by the hero-image/hero-image-mobile/motion-video upload endpoints
// below — each just writes its own SiteAsset key into a different column,
// so one field-parameterized setter replaces three near-identical copies.
export async function setServiceMediaKey(id, field, key) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.service.update({ where: { id }, data: { [field]: key } });
}

// Assigns sortOrder = position in the given id list, so admins can drag
// services into a new order (same reorder-by-explicit-list shape as
// homepage sections, just applied to the whole set in one call instead of
// one PATCH per row).
export async function reorderServices(orderedIds) {
  const existingCount = await prisma.service.count({ where: { id: { in: orderedIds } } });
  if (existingCount !== orderedIds.length) return null;

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.service.update({ where: { id }, data: { sortOrder: index } })),
  );

  return prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
}

