import prisma from "../../config/database.js";

export async function listDocuments() {
  return prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      order: true,
      customer: true,
      uploadedBy: true,
    },
  });
}

export async function getDocumentById(id) {
  return prisma.document.findUnique({
    where: { id },
    include: {
      order: true,
      customer: true,
      uploadedBy: true,
    },
  });
}

export async function createDocument(data) {
  return prisma.document.create({
    data: {
      orderId: data.orderId,
      customerId: data.customerId,
      uploadedById: data.uploadedById,
      type: data.type,
      fileName: data.fileName,
      storagePath: data.storagePath,
      mimeType: data.mimeType || null,
      sizeBytes: data.sizeBytes || null,
    },
    include: {
      order: true,
      customer: true,
      uploadedBy: true,
    },
  });
}
