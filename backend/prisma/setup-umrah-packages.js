import { fileURLToPath } from "node:url";
import path from "node:path";
import prisma from "../src/config/database.js";
import { ensureUmrahGuarantorRequirement } from "../src/modules/requirements/umrah-guarantor.js";
import { umrahPackageKind } from "../src/modules/umrah/umrah-packages.js";

// The three Umrah package types (umrah/umrah-packages.js): visa only, with
// flight services, with sea services. Idempotent and additive:
//   - SVC-UMRAH-VISA gets `KIND: VISA_ONLY` (and short default inclusions)
//     only when it has none yet; its price and everything else stay as set.
//   - The flight and sea packages are created if missing, INACTIVE and
//     priced "by quote" with no amount: prices are the agency's to set. In
//     the back-office (الإدارة → العمرة) set each package's fixed price and
//     currency, check the inclusions and requirements, then publish it.
// Other Umrah packages and existing requests are never touched.
const VISA_ONLY_CODE = "SVC-UMRAH-VISA";
const NOT_INCLUDED = ["EXCLUDED: السكن", "EXCLUDED: النقل داخل السعودية"];

export const UMRAH_PACKAGE_TYPES = [
  {
    code: VISA_ONLY_CODE,
    name: "تأشيرة عمرة فقط",
    features: ["KIND: VISA_ONLY", "INCLUDED: إصدار تأشيرة العمرة", "EXCLUDED: تذاكر السفر", ...NOT_INCLUDED],
  },
  {
    code: "SVC-UMRAH-AIR",
    name: "عمرة مع خدمات الطيران",
    features: ["KIND: AIR", "INCLUDED: إصدار تأشيرة العمرة", "INCLUDED: تذاكر الطيران", ...NOT_INCLUDED],
  },
  {
    code: "SVC-UMRAH-SEA",
    name: "عمرة مع خدمات البحر",
    features: ["KIND: SEA", "INCLUDED: إصدار تأشيرة العمرة", "INCLUDED: تذاكر العبّارة", ...NOT_INCLUDED],
  },
];

const hasDetails = (features) => features.some((feature) => typeof feature === "string" && /^(INCLUDED|EXCLUDED):/.test(feature));

// `db` is the Prisma client or a transaction (the staging activation route
// runs this inside its own transaction, so setup and prices land together).
export async function ensureUmrahPackageTypes(db = prisma, { quiet = false } = {}) {
  const changed = [];
  const visaOnly = await db.service.findUnique({
    where: { code: VISA_ONLY_CODE },
    include: { requirements: { where: { active: true } } },
  });

  for (const type of UMRAH_PACKAGE_TYPES) {
    const existing = type.code === VISA_ONLY_CODE ? visaOnly : await db.service.findUnique({ where: { code: type.code } });
    if (existing) {
      const features = Array.isArray(existing.features) ? existing.features : [];
      if (umrahPackageKind(features)) continue;
      const kind = type.features.filter((feature) => feature.startsWith("KIND:"));
      const details = hasDetails(features) ? [] : type.features.filter((feature) => !feature.startsWith("KIND:"));
      await db.service.update({ where: { id: existing.id }, data: { features: [...kind, ...features, ...details] } });
      changed.push(`${type.code} (type set)`);
      continue;
    }

    const service = await db.service.create({
      data: {
        code: type.code,
        name: type.name,
        category: "UMRAH_PACKAGE",
        basePrice: 0,
        currency: "SAR",
        pricingMode: "QUOTE",
        priceUnit: "PER_TRAVELER",
        active: false,
        features: type.features,
      },
    });
    // Same checklist as the visa-only package (passport per pilgrim, ...).
    for (const requirement of visaOnly?.requirements ?? []) {
      // eslint-disable-next-line no-unused-vars
      const { id, visaTypeId, serviceId, createdAt, updatedAt, conditionRequirementId, conditionOperator, conditionValue, ...fields } = requirement;
      await db.visaRequirement.create({ data: { ...fields, serviceId: service.id } });
    }
    await ensureUmrahGuarantorRequirement(db, service.id);
    changed.push(`${type.code} (created inactive)`);
  }

  if (!quiet) console.log(changed.length ? `Umrah package types: ${changed.join(", ")}` : "Umrah package types already set; nothing changed.");
  return changed;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  ensureUmrahPackageTypes()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
