import prisma from "../../config/database.js";

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function listOffers() {
  return prisma.offer.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getOfferById(id) {
  return prisma.offer.findUnique({ where: { id } });
}

export async function createOffer(data) {
  return prisma.offer.create({
    data: {
      title: data.title,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      price: data.price,
      currency: data.currency || "SAR",
      startDate: toDateOrNull(data.startDate),
      endDate: toDateOrNull(data.endDate),
      status: data.status || "DRAFT",
    },
  });
}
