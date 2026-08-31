import prisma from "../../config/database.js";

export async function listSuppliers() {
  return prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getSupplierById(id) {
  return prisma.supplier.findUnique({
    where: { id },
  });
}

export async function createSupplier(data) {
  return prisma.supplier.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      phone: data.phone || null,
      email: data.email || null,
      notes: data.notes || null,
      active: typeof data.active === "boolean" ? data.active : true,
      submissionChannel: data.submissionChannel || null,
      submissionEmail: data.submissionEmail || null,
      portalUrl: data.portalUrl || null,
      expectedProcessingDays: data.expectedProcessingDays ?? null,
    },
  });
}

export async function updateSupplier(id, data) {
  const existing = await prisma.supplier.findUnique({ where: { id } });

  if (!existing) {
    return null;
  }

  return prisma.supplier.update({
    where: { id },
    data,
  });
}
