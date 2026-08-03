import prisma from "../../config/database.js";

export async function listBranches() {
  return prisma.branch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: true,
      orders: true,
    },
  });
}

export async function getBranchById(id) {
  return prisma.branch.findUnique({
    where: { id },
    include: {
      users: true,
      orders: true,
    },
  });
}

export async function createBranch(data) {
  return prisma.branch.create({
    data: {
      code: data.code,
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      active: typeof data.active === "boolean" ? data.active : true,
    },
  });
}
