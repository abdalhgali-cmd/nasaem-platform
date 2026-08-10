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
      include: {
        order: true,
        customer: true,
        uploadedBy: { select: safeUserSelect },
      },
    }),
    prisma.document.count(),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}

export async function getDocumentById(id) {
  return prisma.document.findUnique({
    where: { id },
    include: {
      order: true,
      customer: true,
      uploadedBy: { select: safeUserSelect },
    },
  });
}

// Order and Customer are submitted as two independent IDs (see
// createDocumentSchema) — without this check, a stale/tampered form could
// attach a document to a real order but the wrong customer (or vice
// versa), and nothing else in the write path would catch it.
export async function orderBelongsToCustomer(orderId, customerId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
  return order?.customerId === customerId;
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
      uploadedBy: { select: safeUserSelect },
    },
  });
}

export async function deleteDocument(id) {
  const document = await prisma.document.findUnique({ where: { id } });

  if (!document) {
    return null;
  }

  await prisma.document.delete({ where: { id } });

  const absolutePath = path.join(UPLOAD_ROOT, document.storagePath);

  // Best-effort cleanup: if the file is already missing, that's fine — the
  // DB row is the source of truth and it's already been removed above.
  await fs.unlink(absolutePath).catch(() => {});

  return document;
}
