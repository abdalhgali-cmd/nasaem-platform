import { listActivityLogs } from "./activity.service.js";
import { parsePagination } from "../../utils/pagination.js";

export async function getActivityLogs(req, res, next) {
  try {
    const { data, meta } = await listActivityLogs({ ...parsePagination(req.query), organizationId: req.user.organizationId });

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
}
