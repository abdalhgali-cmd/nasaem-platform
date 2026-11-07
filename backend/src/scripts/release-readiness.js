// Release readiness check — READ-ONLY. Run it on staging (or production) from
// the service shell to see what is configured and what is missing for the two
// active services (Umrah, Egypt security approval):
//
//   npm run release:readiness            (Arabic summary + blockers)
//   npm run release:readiness -- --json  (machine-readable)
//
// It never writes to the database or the disk, and never prints a secret:
// secrets are reported only as present / missing (and JWT_SECRET's length).
// Exit code 1 when a blocker is found, 0 otherwise.
import fs from "node:fs";
import prisma from "../config/database.js";
import { getCurrencyRateStatuses } from "../modules/flights/flights.service.js";
import { intakeScope } from "../modules/service-scope/intake-scope.js";
import { deploymentName, pricesAreTestData } from "../config/deployment.js";

const EGYPT_VARIANTS = ["VISA-EGYPT-CLEARANCE-AIR", "VISA-EGYPT-CLEARANCE-BORDER"];
const UMRAH_APPROVED_CODES = ["SVC-UMRAH-VISA", "SVC-UMRAH-AIR", "SVC-UMRAH-SEA"];
const present = (name, env) => Boolean(String(env[name] || "").trim());

export async function collectReadiness({ db = prisma, env = process.env } = {}) {
  const blockers = [];
  const warnings = [];
  // Prices and exchange rates are development/test data outside production,
  // and on production until PRICES_APPROVED=true (owner decisions 2026-11-01
  // and 2026-11-02): a missing or unconfirmed price is then noted for the
  // admin dashboard, never a release blocker. Once the owner approves the
  // production prices, a package nobody can book blocks.
  const testPrices = pricesAreTestData(env);
  const priceIssues = testPrices ? warnings : blockers;

  // ---- environment (names only; values of secrets are never read out)
  const environment = {
    NODE_ENV: env.NODE_ENV || null,
    DEPLOYMENT_ENVIRONMENT: env.DEPLOYMENT_ENVIRONMENT || null,
    deployment: deploymentName(env),
    pricesAreTestData: testPrices,
    PRICES_APPROVED: env.PRICES_APPROVED === "true" ? "true" : "not set",
    PUBLIC_INTAKE_SCOPE: intakeScope(env) ? intakeScope(env).join(",") : "ALL",
    JWT_SECRET: present("JWT_SECRET", env) ? `present (${String(env.JWT_SECRET).length} chars)` : "missing",
    CORS_ORIGIN: present("CORS_ORIGIN", env) ? "present" : "missing",
    WHATSAPP_API_TOKEN: present("WHATSAPP_API_TOKEN", env) ? "present" : "missing",
    WHATSAPP_PHONE_NUMBER_ID: present("WHATSAPP_PHONE_NUMBER_ID", env) ? "present" : "missing",
    WHATSAPP_TEMPLATE_NAME: present("WHATSAPP_TEMPLATE_NAME", env) ? "present" : "missing",
    WHATSAPP_ADMIN_NUMBER: present("WHATSAPP_ADMIN_NUMBER", env) ? "present" : "missing",
    PROVIDER_EMAIL_API_URL: present("PROVIDER_EMAIL_API_URL", env) ? "present" : "missing",
    PROVIDER_EMAIL_API_KEY: present("PROVIDER_EMAIL_API_KEY", env) ? "present" : "missing",
    UPLOAD_ROOT: present("UPLOAD_ROOT", env) ? "present" : "missing",
  };
  if (env.NODE_ENV !== "production") warnings.push("NODE_ENV ليس production (رموز التحقق قد تُعاد في الاستجابة في وضع التطوير).");
  if (!present("JWT_SECRET", env) || String(env.JWT_SECRET).length < 32) blockers.push("JWT_SECRET غير مضبوط أو أقصر من 32 حرفًا.");
  if (!present("CORS_ORIGIN", env)) blockers.push("CORS_ORIGIN غير مضبوط: الموقع لن يستطيع الإرسال.");
  if (!present("WHATSAPP_API_TOKEN", env) || !present("WHATSAPP_PHONE_NUMBER_ID", env)) {
    blockers.push("واتساب غير مهيأ: لن يصل رمز التحقق، فلن يستطيع العملاء تتبع طلباتهم.");
  } else if (!present("WHATSAPP_TEMPLATE_NAME", env)) {
    warnings.push("لا يوجد قالب واتساب معتمد (WHATSAPP_TEMPLATE_NAME): الرسائل الحرة تصل فقط لمن راسل الرقم خلال 24 ساعة.");
  }
  if (!present("PROVIDER_EMAIL_API_URL", env) || !present("PROVIDER_EMAIL_API_KEY", env)) {
    warnings.push("البريد غير مهيأ: لن يُرسل إيصال السداد بالبريد (يبقى متاحًا للتحميل في الطلب).");
  }

  // ---- uploads (checked without writing anything)
  let uploads = { configured: present("UPLOAD_ROOT", env), exists: false, writable: false };
  if (uploads.configured) {
    try {
      uploads.exists = fs.statSync(env.UPLOAD_ROOT).isDirectory();
      fs.accessSync(env.UPLOAD_ROOT, fs.constants.W_OK);
      uploads.writable = true;
    } catch {
      // reported below
    }
  }
  if (env.NODE_ENV === "production" && (!uploads.configured || !uploads.exists || !uploads.writable)) {
    blockers.push("مجلد المستندات (UPLOAD_ROOT) غير مضبوط أو غير موجود أو غير قابل للكتابة: رفع الجوازات والإيصالات سيفشل.");
  }

  // ---- prices of the two active services
  const umrah = await db.service.findMany({
    where: { OR: [{ category: { in: ["UMRAH_PACKAGE", "umrah_package"] } }, { code: { startsWith: "SVC-UMRAH" } }] },
    select: { code: true, name: true, active: true, pricingMode: true, basePrice: true, currency: true, priceUnit: true },
    orderBy: { code: "asc" },
  });
  const egypt = await db.visaType.findMany({
    where: { code: { in: EGYPT_VARIANTS } },
    select: { code: true, name: true, active: true, pricingMode: true, basePrice: true, currency: true, priceUnit: true },
    orderBy: { code: "asc" },
  });
  const bookable = (row) => row.active && row.pricingMode === "FIXED" && Number(row.basePrice) > 0 && Boolean(row.currency);
  for (const code of UMRAH_APPROVED_CODES) {
    const row = umrah.find((item) => item.code === code);
    if (!row) priceIssues.push(`باقة العمرة ${code} غير موجودة.`);
    else if (!bookable(row)) priceIssues.push(`باقة العمرة ${code} غير قابلة للحجز (يجب أن تكون مفعّلة وبسعر ثابت). اضبطها من «الأسعار والباقات».`);
  }
  for (const code of EGYPT_VARIANTS) {
    const row = egypt.find((item) => item.code === code);
    if (!row) priceIssues.push(`نوع الموافقة ${code} غير موجود.`);
    else if (!bookable(row)) priceIssues.push(`نوع الموافقة ${code} غير قابل للحجز (يجب أن يكون مفعّلًا وبسعر ثابت). اضبطه من «التأشيرات».`);
  }
  // SVC-UMRAH is the umbrella service (its own page), not a bookable package.
  const otherUmrah = umrah.filter((row) => row.active && row.code !== "SVC-UMRAH" && !UMRAH_APPROVED_CODES.includes(row.code));
  if (otherUmrah.length) warnings.push(`باقات عمرة أخرى مفعّلة خارج الثلاث المعتمدة: ${otherUmrah.map((row) => row.code).join("، ")}.`);

  // ---- money: exchange rates and receiving accounts
  const rates = await getCurrencyRateStatuses();
  const accounts = await db.paymentAccount.groupBy({ by: ["currency"], where: { active: true }, _count: { _all: true } });
  const accountCount = Object.fromEntries(accounts.map((row) => [row.currency, row._count._all]));
  const currencies = new Set([...umrah, ...egypt].filter(bookable).map((row) => row.currency));
  for (const currency of currencies) {
    const sdgAccepted = await db.paymentAccount.count({ where: { active: true, currency: "SDG", acceptsForeignInvoices: true } });
    if (!accountCount[currency] && !(rates[currency]?.active && sdgAccepted)) {
      blockers.push(`لا يوجد حساب استلام مفعّل بعملة ${currency} (ولا حساب جنيه يقبل فواتيرها): لن يجد العميل أين يحوّل.`);
    }
    if (currency !== "SDG" && !rates[currency]?.active) {
      warnings.push(`سعر صرف ${currency}→SDG غير مفعّل: لن يظهر المقابل بالجنيه للعميل.`);
    }
  }

  // ---- people and switches
  const staff = await db.user.groupBy({ by: ["role"], where: { status: "ACTIVE" }, _count: { _all: true } });
  const staffCount = Object.fromEntries(staff.map((row) => [row.role, row._count._all]));
  if (!staffCount.ACCOUNTANT && !staffCount.ADMIN && !staffCount.SUPER_ADMIN) blockers.push("لا يوجد من يستطيع قبول الدفعات (محاسب أو مدير).");
  if (!staffCount.EMPLOYEE) warnings.push("لا يوجد موظف عمليات مفعّل.");
  const flags = await db.featureFlag.findMany({ select: { key: true, enabled: true } });
  const flagMap = Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]));
  for (const key of ["WHATSAPP", "PAYMENTS", "DOCUMENTS", "CUSTOMER_UPLOAD"]) {
    if (flagMap[key] === false) (key === "WHATSAPP" ? warnings : blockers).push(`الخاصية ${key} معطّلة.`);
  }

  let migrations = null;
  try {
    const rows = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
    const [{ count }] = await db.$queryRaw`SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    migrations = { applied: count, latest: rows[0]?.migration_name || null };
  } catch {
    warnings.push("تعذرت قراءة جدول الترحيلات.");
  }

  return {
    checkedAt: new Date().toISOString(),
    environment,
    uploads,
    migrations,
    prices: { testData: testPrices, umrah, egypt },
    exchangeRates: rates,
    activePaymentAccounts: accountCount,
    activeStaff: staffCount,
    featureFlags: flagMap,
    blockers,
    warnings,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    const report = await collectReadiness();
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`فحص الجاهزية — ${report.checkedAt}`);
      console.log("\nالبيئة:"); for (const [k, v] of Object.entries(report.environment)) console.log(`  ${k}: ${v ?? "—"}`);
      console.log(`\nالمستندات: ${JSON.stringify(report.uploads)}`);
      console.log(`الترحيلات: ${JSON.stringify(report.migrations)}`);
      if (report.prices.testData) console.log("\nتنبيه: هذه بيئة غير إنتاجية؛ الأسعار وأسعار الصرف بيانات تجريبية وليست أسعارًا نهائية.");
      console.log("\nأسعار العمرة:"); for (const r of report.prices.umrah) console.log(`  ${r.code} ${r.active ? "مفعّل" : "غير مفعّل"} ${r.pricingMode} ${r.basePrice} ${r.currency} ${r.priceUnit}`);
      console.log("أسعار مصر:"); for (const r of report.prices.egypt) console.log(`  ${r.code} ${r.active ? "مفعّل" : "غير مفعّل"} ${r.pricingMode} ${r.basePrice} ${r.currency} ${r.priceUnit}`);
      console.log(`\nأسعار الصرف: ${JSON.stringify(report.exchangeRates)}`);
      console.log(`حسابات الاستلام المفعّلة: ${JSON.stringify(report.activePaymentAccounts)}`);
      console.log(`الموظفون المفعّلون: ${JSON.stringify(report.activeStaff)}`);
      console.log(`\nعوائق (${report.blockers.length}):`); for (const b of report.blockers) console.log(`  ✗ ${b}`);
      console.log(`تنبيهات (${report.warnings.length}):`); for (const w of report.warnings) console.log(`  ! ${w}`);
    }
    process.exitCode = report.blockers.length ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}
