import { getDashboardStats, getDashboardSummary, getOperationsCenter } from "./dashboard.service.js";

export async function getDashboard(req, res, next) {
  try {
    const stats = await getDashboardStats(req.user.organizationId);
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function getOperations(req, res, next) {
  try {
    const data = await getOperationsCenter(req.user.organizationId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getSummary(req, res, next) {
  try {
    const data = await getDashboardSummary(req.user.organizationId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
