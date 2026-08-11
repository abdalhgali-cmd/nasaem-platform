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

// Starting airline carriers for the flight multi-offer flow — staff can add
// more via the "الناقلون" admin tab. Keyed on the @@unique([name, mode])
// constraint so this upsert stays idempotent across every `npm start`
// (prisma db seed runs unconditionally on every deploy).
const AIRLINE_CARRIERS = [
  { name: "شركة تاركو للطيران", mode: "AIR", code: "TARCO" },
  { name: "شركة بدر للطيران", mode: "AIR", code: "BADR" },
];

async function seedCarriers() {
  for (const carrier of AIRLINE_CARRIERS) {
    await prisma.carrier.upsert({
      where: { name_mode: { name: carrier.name, mode: carrier.mode } },
      update: {},
      create: carrier,
    });
  }

  console.log(`Seeded ${AIRLINE_CARRIERS.length} carriers.`);
}

async function main() {
  // Runs on every seed invocation (idempotent via upsert), independent of
  // whether the super admin already exists.
  await seedSuperAdmin();
  await seedServiceCategories();
  await seedCarriers();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
