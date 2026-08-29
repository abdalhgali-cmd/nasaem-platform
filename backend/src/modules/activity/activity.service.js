import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listActivityLogs({ page, limit, skip, organizationId }) {
  const where = organizationId ? { organizationId } : {};
  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: safeUserSelect },
      },
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}
