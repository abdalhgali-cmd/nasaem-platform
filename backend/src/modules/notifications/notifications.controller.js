import { listNotifications, markNotificationRead } from "./notifications.service.js";
import { parsePagination } from "../../utils/pagination.js";

export async function getNotifications(req, res, next) {
  try {
    const { data, meta } = await listNotifications(req.user.id, parsePagination(req.query));

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
}

export async function readNotification(req, res, next) {
  try {
    const { id } = req.params;
    const notification = await markNotificationRead(req.user.id, id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
}
