import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";
import { nextSequence } from "../src/utils/sequence.js";

// Mirrors the category keys in frontend/assets/services-data.js so the
// staff "new request" page can resolve a real Service.id (needed by
// POST /api/orders) from the category the employee picks in the UI.
const SERVICE_CATEGORIES = [
  { code: "SVC-FLIGHT", name: "تذاكر الطيران", category: "flight" },
  { code: "SVC-HOTEL", name: "حجز الفنادق", category: "hotel" },
  { code: "SVC-UMRAH", name: "خدمات العمرة", category: "umrah" },
  { code: "SVC-FAMILY-VISIT", name: "تأشيرة الزيارة العائلية", category: "family_visit" },
  { code: "SVC-WORK-VISA", name: "تأشيرة العمل", category: "work_visa" },
  { code: "SVC-EGYPT-CLEARANCE", name: "الموافقة الأمنية لمصر", category: "egypt_clearance" },
  { code: "SVC-FERRY", name: "حجز العبارات", category: "ferry" },
  { code: "SVC-INTL-VISA", name: "التأشيرات الدولية", category: "intl_visa" },
  { code: "SVC-TASHEEL", name: "حجز مواعيد تساهيل", category: "tasheel" },
];

async function seedSuperAdmin() {
  const email = "admin@nasaem-platform.local";

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log("Super admin already exists.");
    return;
  }

  const seedPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Set it in your .env before running the seed script."
    );
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const employeeNo = `EMP-${String(await nextSequence("employee")).padStart(4, "0")}`;

  const superAdmin = await prisma.user.create({
    data: {
      employeeNo,
      fullName: "Super Admin",
      email,
      phone: "+0000000000",
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Super admin created:", superAdmin.email);
  console.log("Remember to change this password after the first login.");
}

async function seedServiceCategories() {
  for (const svc of SERVICE_CATEGORIES) {
    await prisma.service.upsert({
      where: { code: svc.code },
      update: {},
      create: {
        code: svc.code,
        name: svc.name,
        category: svc.category,
        basePrice: 0,
        currency: "SAR",
      },
    });
  }

  console.log(`Seeded ${SERVICE_CATEGORIES.length} service categories.`);
}

// The public /packages page (web/src/app/packages/page.tsx) displays these
// three packages as plain hardcoded copy with no backend identifier. There
// is no dedicated Package model — per the Phase 1 intake design, each
// package is represented as a real Service row (category="package") so a
// Public Service Intake submission can carry a real serviceId instead of a
// fabricated one. Prices mirror the page's current display prices; staff
// can adjust them later via the existing Service PATCH endpoint.
const PACKAGE_SERVICES = [
  { code: "SVC-PKG-FAMILY", name: "باقة العائلة", basePrice: 2900 },
  { code: "SVC-PKG-HONEYMOON", name: "باقة شهر العسل", basePrice: 5200 },
  { code: "SVC-PKG-BUSINESS", name: "باقة رحلات العمل", basePrice: 3600 },
];

async function seedPackageServices() {
  for (const pkg of PACKAGE_SERVICES) {
    await prisma.service.upsert({
      where: { code: pkg.code },
      update: {},
      create: {
        code: pkg.code,
        name: pkg.name,
        category: "package",
        basePrice: pkg.basePrice,
        currency: "SAR",
      },
    });
  }

  console.log(`Seeded ${PACKAGE_SERVICES.length} package services.`);
}

// VisaType existed in the schema from the start but was never seeded or
// used anywhere in the codebase until the Phase 1 Public Service Intake —
// these rows back the "نوع التأشيرة" selection on the public /visas intake,
// matching the categories already shown on web/src/app/visas/page.tsx.
// Linked to the matching Service row (seeded above) where one already
// exists for that category; "تأشيرة العمرة" links to the existing Umrah
// service since no separate visa-only service exists for it yet.
const VISA_TYPES = [
  {
    code: "VISA-UMRAH",
    name: "تأشيرة العمرة",
    country: "السعودية",
    serviceCode: "SVC-UMRAH",
  },
  {
    code: "VISA-FAMILY-VISIT",
    name: "الزيارة العائلية",
    country: "السعودية",
    serviceCode: "SVC-FAMILY-VISIT",
  },
  {
    code: "VISA-WORK",
    name: "تأشيرة العمل",
    country: "السعودية",
    serviceCode: "SVC-WORK-VISA",
  },
  {
    code: "VISA-INTERNATIONAL",
    name: "التأشيرات الدولية",
    country: "دولي",
    serviceCode: "SVC-INTL-VISA",
  },
  {
    code: "VISA-EGYPT-CLEARANCE",
    name: "الموافقة الأمنية لمصر",
    country: "مصر",
    serviceCode: "SVC-EGYPT-CLEARANCE",
  },
];

async function seedVisaTypes() {
  for (const visa of VISA_TYPES) {
    const service = await prisma.service.findUnique({ where: { code: visa.serviceCode } });

    await prisma.visaType.upsert({
      where: { code: visa.code },
      update: {},
      create: {
        code: visa.code,
        name: visa.name,
        country: visa.country,
        basePrice: 0,
        currency: "SAR",
        serviceId: service?.id ?? null,
      },
    });
  }

  console.log(`Seeded ${VISA_TYPES.length} visa types.`);
}

async function main() {
  // Runs on every seed invocation (idempotent via upsert), independent of
  // whether the super admin already exists.
  await seedSuperAdmin();
  await seedServiceCategories();
  await seedPackageServices();
  // Visa types reference services by code, so they must be seeded after
  // seedServiceCategories()/seedPackageServices() have created those rows.
  await seedVisaTypes();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
