import prisma from "../../config/database.js";

// --- Operators ---

export async function listOperators({ includeInactive = false } = {}) {
  return prisma.ferryOperator.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createOperator(data) {
  return prisma.ferryOperator.create({
    data: {
      name: data.name,
      nameEn: data.nameEn || null,
      active: typeof data.active === "boolean" ? data.active : true,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateOperator(id, data) {
  const existing = await prisma.ferryOperator.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.ferryOperator.update({ where: { id }, data });
}

export async function deleteOperator(id) {
  const existing = await prisma.ferryOperator.findUnique({ where: { id } });
  if (!existing) return null;

  // A schedule references its operator with onDelete: Cascade — deleting
  // an operator that still has schedules would silently wipe them, so
  // deactivate instead, same posture as services/visa-types.
  const scheduleCount = await prisma.ferrySchedule.count({ where: { operatorId: id } });
  if (scheduleCount > 0) {
    return prisma.ferryOperator.update({ where: { id }, data: { active: false } });
  }

  await prisma.ferryOperator.delete({ where: { id } });
  return existing;
}

export async function setOperatorLogoKey(id, logoKey) {
  const existing = await prisma.ferryOperator.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.ferryOperator.update({ where: { id }, data: { logoKey } });
}

// --- Schedules ---

export async function listSchedules({ includeInactive = false } = {}) {
  return prisma.ferrySchedule.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { travelDate: "asc" }],
    include: { operator: { select: { id: true, name: true, nameEn: true, logoKey: true } } },
  });
}

export async function createSchedule(operatorId, data) {
  const operator = await prisma.ferryOperator.findUnique({ where: { id: operatorId }, select: { id: true } });
  if (!operator) return null;

  return prisma.ferrySchedule.create({
    data: {
      operatorId,
      origin: data.origin,
      destination: data.destination,
      travelDate: data.travelDate,
      departureTime: data.departureTime || null,
      arrivalTime: data.arrivalTime || null,
      durationMinutes: data.durationMinutes ?? null,
      basePrice: data.basePrice,
      currency: data.currency || "SAR",
      capacity: data.capacity ?? null,
      active: typeof data.active === "boolean" ? data.active : true,
      sortOrder: data.sortOrder ?? 0,
    },
    include: { operator: { select: { id: true, name: true, nameEn: true, logoKey: true } } },
  });
}

export async function updateSchedule(id, data) {
  const existing = await prisma.ferrySchedule.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.ferrySchedule.update({
    where: { id },
    data,
    include: { operator: { select: { id: true, name: true, nameEn: true, logoKey: true } } },
  });
}

export async function deleteSchedule(id) {
  const existing = await prisma.ferrySchedule.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.ferrySchedule.delete({ where: { id } });
  return existing;
}

// Public, narrow shape for the ferry booking intake form (replaces its
// previously hardcoded route/carrier <select> options) — active operators
// and active upcoming schedules only, no internal metadata.
export async function getPublicDirectory() {
  const [operators, schedules] = await Promise.all([
    prisma.ferryOperator.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nameEn: true, logoKey: true },
    }),
    prisma.ferrySchedule.findMany({
      where: { active: true, travelDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      orderBy: [{ sortOrder: "asc" }, { travelDate: "asc" }],
      select: {
        id: true,
        operatorId: true,
        origin: true,
        destination: true,
        travelDate: true,
        departureTime: true,
        arrivalTime: true,
        durationMinutes: true,
        basePrice: true,
        currency: true,
        capacity: true,
      },
    }),
  ]);

  return { operators, schedules };
}
