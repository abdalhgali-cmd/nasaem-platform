import bcrypt from "bcryptjs";
import prisma from "../src/config/database.js";
import { nextSequence } from "../src/utils/sequence.js";
import { FEATURE_FLAG_DESCRIPTIONS, FEATURE_FLAG_KEYS } from "../src/modules/feature-flags/feature-flags.constants.js";
import { reconcileEgyptClearanceRequirements } from "./seed-egypt-clearance.js";

const SERVICE_CATEGORIES = [
  { code: "SVC-FLIGHT", name: "تذاكر الطيران", category: "flight" },
  { code: "SVC-HOTEL", name: "حجز الفنادق", category: "hotel" },
  { code: "SVC-UMRAH", name: "خدمات العمرة", category: "umrah" },
  { code: "SVC-FAMILY-VISIT", name: "تأشيرة الزيارة العائلية", category: "family_visit" },
  { code: "SVC-WORK-VISA", name: "تأشيرة العمل", category: "work_visa" },
  // motionEnabled seeds true here only because this dedicated page already
  // shipped with an always-on CSS plane animation before the admin toggle
  // (Service.motionEnabled) existed — every other service defaults to the
  // column's own default (false) and is opted in by an admin instead.
  { code: "SVC-EGYPT-CLEARANCE", name: "الموافقة الأمنية لمصر", category: "egypt_clearance", motionEnabled: true },
  { code: "SVC-FERRY", name: "حجز العبارات", category: "ferry" },
  { code: "SVC-INTL-VISA", name: "التأشيرات الدولية", category: "intl_visa" },
  { code: "SVC-TASHEEL", name: "حجز مواعيد تساهيل", category: "tasheel" },
];

const DEFAULT_ORGANIZATION = {
  id: "org_nasaem_default",
  slug: "nasaem-alharamain",
  name: "نسائم الحرمين للسفر والسياحة",
};

async function seedDefaultOrganization() {
  await prisma.organization.upsert({
    where: { id: DEFAULT_ORGANIZATION.id },
    update: { slug: DEFAULT_ORGANIZATION.slug, name: DEFAULT_ORGANIZATION.name, active: true },
    create: DEFAULT_ORGANIZATION,
  });
}

async function seedSuperAdmin() {
  const email = "admin@nasaem-platform.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.organizationId !== DEFAULT_ORGANIZATION.id) {
      await prisma.user.update({ where: { id: existing.id }, data: { organizationId: DEFAULT_ORGANIZATION.id } });
    }
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
      organizationId: DEFAULT_ORGANIZATION.id,
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
        motionEnabled: Boolean(svc.motionEnabled),
      },
    });
  }
  console.log(`Seeded ${SERVICE_CATEGORIES.length} service categories.`);
}

// Every public package has a real Service row so intake requests keep the
// exact selected serviceId instead of relying on display-only text.
//
// category distinguishes real Umrah products (UMRAH_PACKAGE) from generic
// travel packages (package) — the Umrah screen/section must never show a
// honeymoon/family/business package as an Umrah product. Kept as two
// literal values on the same `category` string column (no migration) since
// listPublicPackages() already accepted both; see the 20260921000000
// migration that reclassifies any already-seeded production rows for these
// three codes.
const PACKAGE_SERVICES = [
  { code: "SVC-PKG-FAMILY", name: "باقة العائلة", basePrice: 2900, category: "package" },
  { code: "SVC-PKG-HONEYMOON", name: "باقة شهر العسل", basePrice: 5200, category: "package" },
  { code: "SVC-PKG-BUSINESS", name: "باقة رحلات العمل", basePrice: 3600, category: "package" },
  { code: "SVC-UMRAH-VISA", name: "تأشيرة عمرة فقط", basePrice: 1200, category: "UMRAH_PACKAGE" },
  { code: "SVC-UMRAH-SERVICES", name: "عمرة مع الخدمات", basePrice: 4500, category: "UMRAH_PACKAGE" },
  { code: "SVC-UMRAH-GROUP", name: "العمرة الجماعية (الأفواج)", basePrice: 3800, category: "UMRAH_PACKAGE" },
];

async function seedPackageServices() {
  for (const pkg of PACKAGE_SERVICES) {
    await prisma.service.upsert({
      where: { code: pkg.code },
      // Re-running the seed against an environment created before the
      // UMRAH_PACKAGE split must correct an already-seeded row's category,
      // not just leave it at its original "package" value.
      update: { category: pkg.category },
      create: {
        code: pkg.code,
        name: pkg.name,
        category: pkg.category,
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
  { code: "VISA-EGYPT-CLEARANCE", name: "الموافقة الأمنية لمصر", country: "مصر", serviceCode: "SVC-EGYPT-CLEARANCE", category: "OTHER", currency: "SDG" },
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
        currency: visa.currency || "SAR",
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
//
// `parentScope` links the requirement to its VisaType/Service (an unrelated
// use of the word "scope" from VisaRequirement's own `scope` column below —
// unfortunate naming collision, not the same concept). `requirementScope`
// is that column: who within one request this requirement applies to. Only
// applied when creating a NEW row — an existing row's scope is left alone
// even if it doesn't match, the same way admin-edited content elsewhere in
// this file is never silently overwritten on reseed.
async function seedRequirementsForScope(parentScope, names, { requirementScope } = {}) {
  let created = 0;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const existing = await prisma.visaRequirement.findFirst({ where: { ...parentScope, name } });
    if (existing) {
      // Update existing to ensure it has correct allowedMimeTypes (idempotent)
      // This handles cases where the requirement exists but data may be incomplete
      if (!existing.allowedMimeTypes || existing.allowedMimeTypes.length === 0) {
        await prisma.visaRequirement.update({
          where: { id: existing.id },
          data: {
            allowedMimeTypes: ATTACHMENT_MIME_TYPES,
            maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
          },
        });
      }
      continue;
    }

    await prisma.visaRequirement.create({
      data: {
        ...parentScope,
        name,
        required: true,
        maxFiles: 1,
        allowedMimeTypes: ATTACHMENT_MIME_TYPES,
        maxSizeBytes: MAX_ATTACHMENT_SIZE_BYTES,
        reviewRequired: true,
        ocrEnabled: false,
        sortOrder: index,
        active: true,
        ...(requirementScope ? { scope: requirementScope } : {}),
      },
    });
    created += 1;
  }
  return created;
}

async function seedVisaRequirements() {
  let created = 0;

  // Passport photo + personal photo are inherently per-person documents —
  // every traveler in a multi-traveler Umrah/package booking needs their
  // OWN copy, never one shared for the whole case (see the Service Intake
  // wizard's per-traveler upload slots, which only actually separate
  // travelers for a requirement whose scope is TRAVELER).
  const umrahService = await prisma.service.findUnique({ where: { code: "SVC-UMRAH" } });
  if (umrahService) {
    created += await seedRequirementsForScope(
      { serviceId: umrahService.id },
      UMRAH_REQUIREMENT_NAMES,
      { requirementScope: "TRAVELER" }
    );
  }

  for (const pkg of PACKAGE_SERVICES) {
    const service = await prisma.service.findUnique({ where: { code: pkg.code } });
    if (service) {
      created += await seedRequirementsForScope(
        { serviceId: service.id },
        PACKAGE_REQUIREMENT_NAMES,
        { requirementScope: "TRAVELER" }
      );
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

  // A passport/personal-photo document belongs to each visitor, while the
  // invitation and sponsor residency remain case-level documents shared by
  // the family-visit request. Keep reruns aligned with the migration that
  // corrects already-seeded databases.
  const familyVisitVisa = await prisma.visaType.findUnique({ where: { code: "VISA-FAMILY-VISIT" } });
  if (familyVisitVisa) {
    await prisma.visaRequirement.updateMany({
      where: {
        visaTypeId: familyVisitVisa.id,
        name: "صورة الجواز والصورة الشخصية",
      },
      data: { scope: "TRAVELER" },
    });
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

// Default FAQ for the Egypt Security Approval landing page
// (EGYPT_CLEARANCE_FAQ, see settings.service.js's PUBLIC_SETTING_KEYS).
// Answers deliberately never invent processing durations or government
// requirements not already present in the seeded VisaRequirement
// checklist — they point the customer back to the checklist/support
// channels instead of guessing at rules this platform doesn't own.
const EGYPT_CLEARANCE_FAQ_DEFAULT = [
  {
    question: "ما هي المستندات المطلوبة؟",
    answer: "قائمة المستندات المطلوبة تظهر لك مباشرة داخل نموذج التقديم، وتختلف حسب حالتك. أرفق كل مستند كما هو موضح في كل خطوة.",
  },
  {
    question: "كيف أقدّم الطلب؟",
    answer: "اضغط على زر «ابدأ طلبك» وأكمل الخطوات بالترتيب: بياناتك، بيانات السفر، المستندات، ثم المراجعة والإرسال.",
  },
  {
    question: "كيف أتابع حالة طلبي؟",
    answer: "استخدم رقم هاتفك من صفحة «تتبع الطلب» لعرض حالة طلبك الحالية والخطوة التالية المطلوبة منك، إن وُجدت.",
  },
  {
    question: "كيف أعرف أن هناك مستندًا ناقصًا أو مرفوضًا؟",
    answer: "ستظهر حالة كل مستند (قيد المراجعة / مقبول / مرفوض) في صفحة التتبع، مع ملاحظة توضح سبب الرفض إن وُجد، وزر لإعادة الرفع.",
  },
  {
    question: "كيف أدفع؟",
    answer: "بعد مراجعة طلبك سيصلك السعر المعتمد، ويمكنك الاطلاع على طرق الدفع المعتمدة من صفحة التتبع بعد اعتماد السعر.",
  },
  {
    question: "كيف أستلم الوثيقة بعد اكتمال المعاملة؟",
    answer: "ستصلك الوثيقة النهائية كملف قابل للتنزيل من صفحة تتبع طلبك فور رفعها من فريقنا، مع إشعار لك بذلك.",
  },
  {
    question: "هل يمكنني العودة لإكمال الطلب لاحقًا؟",
    answer: "نعم، يحفظ النموذج تقدّمك تلقائيًا في متصفحك، ويمكنك المتابعة من نفس النقطة عند العودة إلى صفحة الطلب.",
  },
];

async function seedEgyptClearanceFaq() {
  await prisma.setting.upsert({
    where: { key: "EGYPT_CLEARANCE_FAQ" },
    // Never overwrite content an admin has already edited via the
    // back-office Settings screen — only create it if it doesn't exist.
    update: {},
    create: { key: "EGYPT_CLEARANCE_FAQ", value: JSON.stringify(EGYPT_CLEARANCE_FAQ_DEFAULT) },
  });
  console.log("Seeded default Egypt Security Approval FAQ setting.");
}

// Default FAQ for the Saudi Family Visit landing page (SAUDI_FAMILY_VISIT_FAQ)
// — same rationale as EGYPT_CLEARANCE_FAQ_DEFAULT above: answers point back
// to the live checklist/tracking/support surfaces rather than inventing
// requirements or durations this platform doesn't own.
const SAUDI_FAMILY_VISIT_FAQ_DEFAULT = [
  {
    question: "ما هي المستندات المطلوبة؟",
    answer: "قائمة المستندات المطلوبة تظهر لك مباشرة داخل نموذج التقديم، وتختلف حسب حالتك. أرفق كل مستند كما هو موضح في كل خطوة.",
  },
  {
    question: "كيف أقدّم الطلب؟",
    answer: "اضغط على زر «ابدأ الطلب» وأكمل الخطوات بالترتيب: بياناتك، بيانات السفر، المستندات، ثم المراجعة والإرسال.",
  },
  {
    question: "كيف أتابع حالة طلبي؟",
    answer: "استخدم رقم هاتفك من صفحة «تتبع الطلب» لعرض حالة طلبك الحالية والخطوة التالية المطلوبة منك، إن وُجدت.",
  },
  {
    question: "هل يمكنني تقديم طلب لعدة أفراد من العائلة؟",
    answer: "نعم، يمكنك إضافة بيانات أكثر من مسافر داخل نفس الطلب من خطوة «بيانات السفر».",
  },
  {
    question: "كيف أدفع؟",
    answer: "بعد مراجعة طلبك سيصلك السعر المعتمد، ويمكنك الاطلاع على طرق الدفع المعتمدة من صفحة التتبع بعد اعتماد السعر.",
  },
  {
    question: "هل يمكنني العودة لإكمال الطلب لاحقًا؟",
    answer: "نعم، يحفظ النموذج تقدّمك تلقائيًا في متصفحك، ويمكنك المتابعة من نفس النقطة عند العودة إلى صفحة الطلب.",
  },
];

async function seedSaudiFamilyVisitFaq() {
  await prisma.setting.upsert({
    where: { key: "SAUDI_FAMILY_VISIT_FAQ" },
    update: {},
    create: { key: "SAUDI_FAMILY_VISIT_FAQ", value: JSON.stringify(SAUDI_FAMILY_VISIT_FAQ_DEFAULT) },
  });
  console.log("Seeded default Saudi Family Visit FAQ setting.");
}

// Keys mirror flights.service.js's FX_KEYS exactly — that module (via
// getCurrencyRates/updateCurrencyRates) is the actual authoritative source
// the public catalog (services.service.js) reads to compute priceSdg, not
// the separate Currency model. Without a real (non-zero) rate, every
// non-SDG service's public "يعادل تقريبًا ... جنيه سوداني" silently never
// appears — fxRateToSdg has nothing to convert with. Placeholder values
// only, an admin is expected to set real rates from the pricing screen.
//
// The 20260822090000_flight_inventory migration already INSERTs these four
// rows at "0" (so flights code has a row to read/write from day one), so a
// plain upsert's `update: {}` would see the row already exists and never
// actually apply a usable default. The app itself treats a 0 rate as "not
// configured" (see convertToSdg/services.service.js), so this does the
// same: only replace a rate that is still 0, never one an admin (or a
// previous run of this seed) has already set to something real.
const DEFAULT_FX_RATES_TO_SDG = {
  FX_SAR_SDG: "115",
  FX_USD_SDG: "430",
  FX_AED_SDG: "117",
  FX_EGP_SDG: "9",
};

async function seedDefaultExchangeRates() {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(DEFAULT_FX_RATES_TO_SDG) } } });
  const currentByKey = new Map(rows.map((row) => [row.key, row.value]));

  for (const [key, placeholder] of Object.entries(DEFAULT_FX_RATES_TO_SDG)) {
    const current = currentByKey.get(key);
    if (current && Number(current) !== 0) continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value: placeholder },
      create: { key, value: placeholder },
    });
  }
  console.log("Seeded default exchange rates (placeholder — update from Admin).");
}

// Without at least one active PaymentAccount, a payment-eligible request has
// nothing to show on "إكمال الدفع" no matter how far its status advances.
// Obviously-fake details (never a real bank/account) so this can never be
// mistaken for a live payment destination if seeded by mistake anywhere but
// a local/dev database. PaymentAccount has no natural unique key beyond its
// generated id, so idempotency here means "only seed if the table is
// completely empty" — once an admin has added a real account (or edited/
// removed this placeholder), reseeding must never add another one back.
async function seedDefaultPaymentAccount() {
  const existing = await prisma.paymentAccount.findFirst({ select: { id: true } });
  if (existing) return;

  // One per currency an approved invoice is realistically issued in
  // locally — most seeded services/packages price in SAR, so a SAR-only
  // or SDG-only placeholder would leave "إكمال الدفع" showing zero
  // accounts for whichever currency wasn't covered (getMyPaymentAccounts
  // filters by the request's own paymentCurrency).
  await prisma.paymentAccount.createManyAndReturn({
    data: [
      {
        name: "الحساب الرئيسي بالريال (بيانات تجريبية للتطوير المحلي)",
        bankName: "بنك تجريبي — تطوير محلي فقط",
        accountName: "نسائم الحرمين للسفر والسياحة",
        accountNumber: "0000000000",
        currency: "SAR",
        active: true,
        sortOrder: 0,
      },
      {
        name: "الحساب الرئيسي بالجنيه (بيانات تجريبية للتطوير المحلي)",
        bankName: "بنك تجريبي — تطوير محلي فقط",
        accountName: "نسائم الحرمين للسفر والسياحة",
        accountNumber: "1111111111",
        currency: "SDG",
        active: true,
        sortOrder: 1,
      },
    ],
  });
  console.log("Seeded default local-dev payment accounts (placeholder — replace from Admin before real use).");
}

async function main() {
  await seedDefaultOrganization();
  await seedSuperAdmin();
  await seedServiceCategories();
  await seedPackageServices();
  await seedVisaTypes();
  await seedVisaRequirements();
  await seedHomepageSections();
  await seedFeatureFlags();
  await seedEgyptClearanceFaq();
  await seedSaudiFamilyVisitFaq();
  await seedDefaultExchangeRates();
  await seedDefaultPaymentAccount();
  // Must run last: seedVisaRequirements() writes the historical Egypt checklist
  // (a plain case-scoped passport document plus the legacy ticket), and this
  // reconciles it into the structured approval-first shape the journey needs.
  await reconcileEgyptClearanceRequirements();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
