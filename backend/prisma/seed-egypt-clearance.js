import { fileURLToPath } from "node:url";
import path from "node:path";
import prisma from "../src/config/database.js";

const EGYPT_CODE = "VISA-EGYPT-CLEARANCE";
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function reconcileEgyptClearanceRequirements() {
  const visaType = await prisma.visaType.findUnique({ where: { code: EGYPT_CODE } });
  if (!visaType) {
    console.log("Egypt clearance visa type not found; skipping structured requirement reconciliation.");
    return;
  }

  const passportLike = await prisma.visaRequirement.findFirst({
    where: {
      visaTypeId: visaType.id,
      OR: [
        { attachmentType: "passport_copy" },
        { name: { contains: "passport", mode: "insensitive" } },
        { name: { contains: "جواز" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (passportLike) {
    await prisma.visaRequirement.update({
      where: { id: passportLike.id },
      data: {
        attachmentType: "passport_copy",
        required: true,
        maxFiles: 1,
        allowedMimeTypes: MIME_TYPES,
        maxSizeBytes: MAX_SIZE_BYTES,
        reviewRequired: true,
        ocrEnabled: true,
        sortOrder: 10,
        active: true,
        type: "DOCUMENT",
        scope: "TRAVELER",
      },
    });
  } else {
    await prisma.visaRequirement.create({
      data: {
        id: "egypt_clearance_passport_v1",
        visaTypeId: visaType.id,
        name: "صورة جواز السفر",
        description: "ارفع صفحة البيانات التي تحتوي على الصورة والبيانات بوضوح. نقبل صورة أو PDF.",
        required: true,
        attachmentType: "passport_copy",
        maxFiles: 1,
        allowedMimeTypes: MIME_TYPES,
        maxSizeBytes: MAX_SIZE_BYTES,
        reviewRequired: true,
        ocrEnabled: true,
        sortOrder: 10,
        active: true,
        type: "DOCUMENT",
        scope: "TRAVELER",
      },
    });
  }

  await prisma.visaRequirement.updateMany({
    where: {
      visaTypeId: visaType.id,
      OR: [
        { name: { contains: "تذكرة" } },
        { name: { contains: "booking", mode: "insensitive" } },
        { name: { contains: "ticket", mode: "insensitive" } },
      ],
    },
    data: { active: false, required: false },
  });

  const entryMode = await prisma.visaRequirement.findFirst({
    where: { visaTypeId: visaType.id, attachmentType: "egypt_entry_mode" },
  });

  const entryModeData = {
    name: "طريقة الدخول إلى مصر",
    description: "اختر طريقة دخولك إلى مصر.",
    required: true,
    attachmentType: "egypt_entry_mode",
    maxFiles: 1,
    allowedMimeTypes: [],
    maxSizeBytes: MAX_SIZE_BYTES,
    reviewRequired: false,
    ocrEnabled: false,
    sortOrder: 20,
    active: true,
    type: "SELECT",
    scope: "TRAVELER",
    options: [
      { value: "AIR", label: "منفذ جوي" },
      { value: "BORDER", label: "منفذ بري" },
    ],
  };

  if (entryMode) {
    await prisma.visaRequirement.update({ where: { id: entryMode.id }, data: entryModeData });
  } else {
    await prisma.visaRequirement.create({
      data: {
        id: "egypt_clearance_entry_mode_v1",
        visaTypeId: visaType.id,
        ...entryModeData,
      },
    });
  }

  console.log("Reconciled Egypt clearance passport, entry-mode, and approval-first ticket requirements.");
}

// Also runnable on its own (`node prisma/seed-egypt-clearance.js`) so the
// reconciliation can be applied to an existing database without re-running the
// whole seed. When imported by seed.js the module must not run or disconnect on
// import, hence the direct-invocation guard.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    await reconcileEgyptClearanceRequirements();
  } finally {
    await prisma.$disconnect();
  }
}
