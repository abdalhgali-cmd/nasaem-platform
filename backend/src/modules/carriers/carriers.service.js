import prisma from "../../config/database.js";

export async function listCarriers({ mode, active } = {}) {
  const where = {};
  if (mode) where.mode = mode;
  if (active !== undefined) where.active = active;

  return prisma.carrier.findMany({
    where,
    orderBy: { name: "asc" },
  });
}

export async function getCarrierById(id) {
  return prisma.carrier.findUnique({ where: { id } });
}

// Duplicate {name, mode} pairs are rejected via the schema's own
// @@unique([name, mode]) constraint (see prisma/seed.js's carrier upsert,
// which relies on that same constraint being idempotent-safe) — surfaced
// here as a normal statusCode-carrying error, same convention
// createOrUpdatePriceQuote already uses for its own business-rule errors.
export async function createCarrier(data) {
  try {
    return await prisma.carrier.create({
      data: {
        name: data.name,
        mode: data.mode,
        code: data.code || null,
        active: data.active ?? true,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw Object.assign(new Error("يوجد ناقل بنفس الاسم والنوع بالفعل"), { statusCode: 409 });
    }
    throw error;
  }
}

export async function updateCarrier(id, data) {
  const existing = await prisma.carrier.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  try {
    return await prisma.carrier.update({
      where: { id },
      data: {
        ...data,
        code: "code" in data ? data.code || null : undefined,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw Object.assign(new Error("يوجد ناقل بنفس الاسم والنوع بالفعل"), { statusCode: 409 });
    }
    throw error;
  }
}
