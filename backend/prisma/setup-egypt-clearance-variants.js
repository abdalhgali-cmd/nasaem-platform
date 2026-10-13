import { fileURLToPath } from "node:url";
import path from "node:path";
import prisma from "../src/config/database.js";
import { EGYPT_CLEARANCE_CODE, EGYPT_CLEARANCE_VARIANTS, EGYPT_ENTRY_MODE_ATTACHMENT } from "../src/modules/egypt-clearance/egypt-clearance-variants.js";

// Creates the Egypt clearance variants (air / border crossing) as visa types
// next to VISA-EGYPT-CLEARANCE, if they do not exist yet. Idempotent and
// additive: an existing variant (and anything an admin set on it) is never
// touched, the original item and existing requests are unchanged.
//
// New variants are created INACTIVE and priced "by quote" with no amount:
// prices are the agency's to set. In the back-office (الإدارة → التأشيرات)
// set each variant's pricing (fixed price + currency), check its
// requirements, then activate it. Until a variant is active the app keeps
// the original single item.
//
// Each new variant copies the original's active requirements except the
// entry-method question (the variant is the entry method).
export async function ensureEgyptClearanceVariants() {
  const base = await prisma.visaType.findUnique({
    where: { code: EGYPT_CLEARANCE_CODE },
    include: { requirements: { where: { active: true } } },
  });
  if (!base) {
    console.log("Egypt clearance visa type not found; no variants created.");
    return [];
  }
  const created = [];
  for (const variant of EGYPT_CLEARANCE_VARIANTS) {
    const existing = await prisma.visaType.findUnique({ where: { code: variant.code }, select: { id: true } });
    if (existing) continue;
    const visaType = await prisma.visaType.create({
      data: {
        code: variant.code,
        name: variant.name,
        country: base.country,
        category: base.category,
        serviceId: base.serviceId,
        currency: base.currency,
        basePrice: 0,
        pricingMode: "QUOTE",
        active: false,
        description: base.description,
        processingTime: base.processingTime,
      },
    });
    const copies = base.requirements.filter((requirement) => requirement.attachmentType !== EGYPT_ENTRY_MODE_ATTACHMENT);
    for (const requirement of copies) {
      // eslint-disable-next-line no-unused-vars
      const { id, visaTypeId, serviceId, createdAt, updatedAt, conditionRequirementId, conditionOperator, conditionValue, ...fields } = requirement;
      await prisma.visaRequirement.create({ data: { ...fields, visaTypeId: visaType.id } });
    }
    created.push(variant.code);
  }
  console.log(created.length ? `Created inactive Egypt clearance variants: ${created.join(", ")}` : "Egypt clearance variants already exist; nothing changed.");
  return created;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await ensureEgyptClearanceVariants();
  } finally {
    await prisma.$disconnect();
  }
}
