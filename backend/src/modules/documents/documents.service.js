import fs from "fs/promises";
import path from "path";
import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

const UPLOAD_ROOT = path.resolve("uploads");

export async function listDocuments({ page, limit, skip }) {
  const [data, total] = await Promise.all([
    prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { order: true, customer: true, uploadedBy: { select: safeUserSelect } },
    }),
    prisma.document.count(),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getDocumentById(id) {
  return prisma.document.findUnique({
    where: { id },
    include: { order: true, customer: true, uploadedBy: { select: safeUserSelect } },
  });
}

export async function createDocument(data) {
  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: { id: true, customerId: true },
  });
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  if (order.customerId !== data.customerId) {
    throw Object.assign(new Error("Document customer does not match order customer"), { statusCode: 409 });
  }

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
    include: { order: true, customer: true, uploadedBy: { select: safeUserSelect } },
  });
}

export async function deleteDocument(id) {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return null;
  await prisma.document.delete({ where: { id } });
  const absolutePath = path.join(UPLOAD_ROOT, document.storagePath);
  await fs.unlink(absolutePath).catch(() => {});
  return document;
}
