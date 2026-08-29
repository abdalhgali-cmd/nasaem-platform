import fs from "fs/promises";
import path from "path";
import prisma from "../../config/database.js";
import { safeUserSelect, safeCustomerSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

const UPLOAD_ROOT = path.resolve("uploads");

export async function listDocuments({ page, limit, skip, organizationId }) {
  const where = organizationId ? { order: { organizationId } } : {};
  const [data, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { order: true, customer: { select: safeCustomerSelect }, uploadedBy: { select: safeUserSelect } },
    }),
    prisma.document.count({ where }),
  ]);
  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getDocumentById(id, organizationId) {
  return prisma.document.findFirst({
    where: { id, ...(organizationId ? { order: { organizationId } } : {}) },
    include: { order: true, customer: { select: safeCustomerSelect }, uploadedBy: { select: safeUserSelect } },
  });
}

export async function createDocument(data, organizationId) {
  const order = await prisma.order.findFirst({
    where: { id: data.orderId, ...(organizationId ? { organizationId } : {}) },
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
    include: { order: true, customer: { select: safeCustomerSelect }, uploadedBy: { select: safeUserSelect } },
  });
}

export async function deleteDocument(id, organizationId) {
  const document = await prisma.document.findFirst({ where: { id, ...(organizationId ? { order: { organizationId } } : {}) } });
  if (!document) return null;
  await prisma.document.delete({ where: { id } });
  const absolutePath = path.join(UPLOAD_ROOT, document.storagePath);
  await fs.unlink(absolutePath).catch(() => {});
  return document;
}
