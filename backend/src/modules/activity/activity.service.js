import prisma from "../../config/database.js";
import { safeUserSelect } from "../../utils/safeSelects.js";
import { buildPaginationMeta } from "../../utils/pagination.js";

export async function listActivityLogs({ page, limit, skip }) {
  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: safeUserSelect },
      },
    }),
    prisma.activityLog.count(),
  ]);

  return { data, meta: buildPaginationMeta(page, limit, total) };
}
