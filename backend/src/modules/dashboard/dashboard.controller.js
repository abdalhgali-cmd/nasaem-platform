import { getDashboardStats, getOperationsCenter } from "./dashboard.service.js";

export async function getDashboard(req, res, next) {
  try {
    const stats = await getDashboardStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOperations(req, res, next) {
  try {
    const data = await getOperationsCenter();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
