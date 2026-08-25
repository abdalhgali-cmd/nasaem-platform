import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";
import { nextSequence } from "../src/utils/sequence.js";
import { FEATURE_FLAG_DESCRIPTIONS, FEATURE_FLAG_KEYS } from "../src/modules/feature-flags/feature-flags.constants.js";

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
    throw new Error("SEED_ADMIN_PASSWORD is not set. Set it in your .env before running the seed script.");
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

// Every public package has a real Service row so intake requests keep the
// exact selected serviceId instead of relying on display-only text.
const PACKAGE_SERVICES = [
  { code: "SVC-PKG-FAMILY", name: "باقة العائلة", basePrice: 2900 },
  { code: "SVC-PKG-HONEYMOON", name: "باقة شهر العسل", basePrice: 5200 },
  { code: "SVC-PKG-BUSINESS", name: "باقة رحلات العمل", basePrice: 3600 },
  { code: "SVC-UMRAH-VISA", name: "تأشيرة عمرة فقط", basePrice: 1200 },
  { code: "SVC-UMRAH-SERVICES", name: "عمرة مع الخدمات", basePrice: 4500 },
  { code: "SVC-UMRAH-GROUP", name: "العمرة الجماعية (الأفواج)", basePrice: 3800 },
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

// category matches VISA_TYPE_CATEGORIES (backend/src/utils/enums.js) — the
// authoritative classification GET /api/services/public?visaCategory=
// filters on, so this is what actually keeps Umrah/Family Visit out of the
// public International Visas section (not any frontend exclusion list).
const VISA_TYPES = [
  { code: "VISA-UMRAH", name: "تأشيرة العمرة", country: "السعودية", serviceCode: "SVC-UMRAH", category: "UMRAH" },
  { code: "VISA-FAMILY-VISIT", name: "الزيارة العائلية", country: "السعودية", serviceCode: "SVC-FAMILY-VISIT", category: "FAMILY_VISIT" },
  { code: "VISA-WORK", name: "تأشيرة العمل", country: "السعودية", serviceCode: "SVC-WORK-VISA", category: "OTHER" },
  { code: "VISA-INTERNATIONAL", name: "التأشيرات الدولية", country: "دولي", serviceCode: "SVC-INTL-VISA", category: "INTERNATIONAL" },
  { code: "VISA-EGYPT-CLEARANCE", name: "الموافقة الأمنية لمصر", country: "مصر", serviceCode: "SVC-EGYPT-CLEARANCE", category: "OTHER" },
];

async function seedVisaTypes() {
  for (const visa of VISA_TYPES) {
    const service = await prisma.service.findUnique({ where: { code: visa.serviceCode } });
    await prisma.visaType.upsert({
      where: { code: visa.code },
      update: { category: visa.category },
      create: {
        code: visa.code,
        name: visa.name,
        country: visa.country,
        basePrice: 0,
        currency: "SAR",
        serviceId: service?.id ?? null,
        category: visa.category,
      },
    });
  }
  console.log(`Seeded ${VISA_TYPES.length} visa types.`);
}

// Mirrors the cards previously hardcoded in
// web/src/components/sections/services.tsx, so switching that section over
// to admin-controlled data (Platform 3.0 Phase 1) doesn't blank the public
// homepage on first deploy — an admin can then edit/reorder/hide from here.
const HOMEPAGE_SECTIONS = [
  { key: "ferries", title: "حجز البواخر", description: "احجز رحلتك البحرية بين سواكن وجدة، وحدد التاريخ وعدد المسافرين والناقل المفضل ليتابع فريقنا التوفر والإجراءات.", href: "/ferries", iconKey: "ship", sortOrder: 0 },
  { key: "umrah", title: "باقات العمرة", description: "تأشيرة فقط أو باقة متكاملة تشمل الطيران والفنادق والنقل — بإشراف كامل من الإدارة حتى العودة.", href: "/umrah", iconKey: "landmark", sortOrder: 1 },
  { key: "visas", title: "التأشيرات", description: "زيارة عائلية، تأشيرة عمل، أو تأشيرات دولية — نتابع إجراءاتك بدقة وسرعة حتى الاستلام.", href: "/visas", iconKey: "stamp", sortOrder: 2 },
  { key: "flights", title: "حجز الطيران", description: "أفضل أسعار تذاكر الطيران الداخلي والدولي على أشهر شركات الطيران، برحلة ذهاب أو ذهاب وعودة.", href: "/flights", iconKey: "plane", sortOrder: 3 },
  { key: "hotels", title: "حجز الفنادق", description: "فنادق قريبة من الحرمين الشريفين وفي كل الوجهات، بمستويات مختلفة تناسب كل ميزانية.", href: "/hotels", iconKey: "hotel", sortOrder: 4 },
  { key: "intl-visas", title: "التأشيرات الدولية", description: "الصين، بالي، ودول أفريقيا — نوضح لك المستندات المطلوبة قبل بدء الإجراءات.", href: "/visas?visaCategory=INTERNATIONAL#book", iconKey: "globe", sortOrder: 5 },
  { key: "packages", title: "باقات السفر الشاملة", description: "برامج سياحية جاهزة تجمع الطيران والإقامة والجولات في باقة واحدة بسعر مريح.", href: "/packages", iconKey: "package", sortOrder: 6 },
];

async function seedHomepageSections() {
  for (const section of HOMEPAGE_SECTIONS) {
    await prisma.homepageSection.upsert({
      where: { key: section.key },
      update: {},
      create: section,
    });
  }
  console.log(`Seeded ${HOMEPAGE_SECTIONS.length} homepage sections.`);
}

// Platform 3.0 "wire the Requirements Engine into the Public Visa Intake
// Wizard": these mirror, verbatim, what used to be hardcoded in
// web/src/components/sections/service-intake-wizard.tsx
// (UMRAH_DOCUMENTS/PACKAGE_DOCUMENTS/VISA_DOCUMENTS_BY_CODE) before the
// wizard was switched to fetch its checklist from
// GET /api/{visa-types,services}/:id/requirements/public. Seeding the
// same checklist items into VisaRequirement (the same admin-editable model
// every other requirements checklist already uses) keeps the customer-
// facing prompt identical on first deploy — an admin can then edit it from
// the existing Requirements Engine admin UI instead of a code change.
const ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // matches upload.middleware.js's global limit

const UMRAH_REQUIREMENT_NAMES = ["صورة الجواز ساري المفعول", "الصورة الشخصية الحديثة"];
const PACKAGE_REQUIREMENT_NAMES = ["صورة الجواز ساري المفعول", "الصورة الشخصية الحديثة"];
const VISA_REQUIREMENT_NAMES_BY_CODE = {
  "VISA-UMRAH": ["صورة الجواز", "الصورة الشخصية", "صورة إقامة الضامن", "رقم الضامن (أبشر)"],
  "VISA-FAMILY-VISIT": [
    "صورة الجواز والصورة الشخصية",
    "مستند الزيارة (الدعوة)",
    "صورة إقامة مرسل الزيارة (من أبشر)",
  ],
  "VISA-WORK": ["عقد العمل", "صورة الجواز", "الصورة الشخصية"],
  "VISA-INTERNATIONAL": ["صورة الجواز", "الصورة الشخصية"],
  "VISA-EGYPT-CLEARANCE": ["صورة الجواز", "تذكرة الطيران أو طلب الحجز"],
};

// No unique constraint ties a VisaRequirement to its (scope, name) pair —
// checked instead of upserted, same idempotency guarantee as every upsert
// elsewhere in this file (a rerun never duplicates rows).
async function seedRequirementsForScope(scope, names) {
  let created = 0;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const existing = await prisma.visaRequirement.findFirst({ where: { ...scope, name } });
    if (existing) continue;

    await prisma.visaRequirement.create({
      data: {
        ...scope,
        name,
        required: true,
        maxFiles: 1,
        allowedMimeTypes: ATTACHMENT_MIME_TYPES,
        maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
        reviewRequired: true,
        ocrEnabled: false,
        sortOrder: index,
        active: true,
      },
    });
    created += 1;
  }
  return created;
}

async function seedVisaRequirements() {
  let created = 0;

  const umrahService = await prisma.service.findUnique({ where: { code: "SVC-UMRAH" } });
  if (umrahService) {
    created += await seedRequirementsForScope({ serviceId: umrahService.id }, UMRAH_REQUIREMENT_NAMES);
  }

  for (const pkg of PACKAGE_SERVICES) {
    const service = await prisma.service.findUnique({ where: { code: pkg.code } });
    if (service) {
      created += await seedRequirementsForScope({ serviceId: service.id }, PACKAGE_REQUIREMENT_NAMES);
    }
  }

  for (const visa of VISA_TYPES) {
    const names = VISA_REQUIREMENT_NAMES_BY_CODE[visa.code];
    if (!names) continue;
    const visaType = await prisma.visaType.findUnique({ where: { code: visa.code } });
    if (visaType) {
      created += await seedRequirementsForScope({ visaTypeId: visaType.id }, names);
    }
  }

  console.log(`Seeded ${created} visa/service document requirements.`);
}

async function seedFeatureFlags() {
  for (const key of FEATURE_FLAG_KEYS) {
    await prisma.featureFlag.upsert({
      where: { key },
      // Update only the description, never `enabled` — an admin's
      // deliberate toggle must survive a reseed unchanged.
      update: { description: FEATURE_FLAG_DESCRIPTIONS[key] ?? null },
      create: { key, enabled: true, description: FEATURE_FLAG_DESCRIPTIONS[key] ?? null },
    });
  }
  console.log(`Seeded ${FEATURE_FLAG_KEYS.length} feature flags.`);
}

async function main() {
  await seedSuperAdmin();
  await seedServiceCategories();
  await seedPackageServices();
  await seedVisaTypes();
  await seedVisaRequirements();
  await seedHomepageSections();
  await seedFeatureFlags();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });