import fs from "fs/promises";
import prisma from "../../config/database.js";
import { safeUserSelect, safeCustomerSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

import { resolveStoredUploadPath } from "../../config/uploadRoot.js";

// organizationId is required and checked explicitly (not spread
// conditionally into `where`) on every function below: Prisma treats
// `{ organizationId: undefined }` as "no filter on that field", so the old
// `organizationId ? { ... } : {}` pattern silently fell back to an
// unscoped, cross-tenant query the moment a caller ever passed a falsy
// value - it never actually enforced the filter's absence, it just hid it.
// Failing closed here means a missing organizationId is always treated as
// "nothing found" (404), the same way a real cross-organization id is,
// never as "show everything".

export async function listDocuments({ page, limit, skip, organizationId }) {
  if (!organizationId) return { data: [], meta: buildPaginationMeta(page, limit, 0) };
  const where = { order: { organizationId } };
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
  if (!organizationId) return null;
  return prisma.document.findFirst({
    where: { id, order: { organizationId } },
    include: { order: true, customer: { select: safeCustomerSelect }, uploadedBy: { select: safeUserSelect } },
  });
}

export async function createDocument(data, organizationId) {
  if (!organizationId) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  const order = await prisma.order.findFirst({
    where: { id: data.orderId, organizationId },
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
  if (!organizationId) return null;
  const document = await prisma.document.findFirst({ where: { id, order: { organizationId } } });
  if (!document) return null;
  await prisma.document.delete({ where: { id } });
  const absolutePath = resolveStoredUploadPath(document.storagePath);
  await fs.unlink(absolutePath).catch(() => {});
  return document;
}
