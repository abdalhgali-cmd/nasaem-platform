import { createPaymentSchema } from "./payments.validators.js";
import { createPayment, getPaymentById, listPayments } from "./payments.service.js";
import { parsePagination } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";

export async function getPayments(req, res, next) {
  try {
    const { data, meta } = await listPayments(parsePagination(req.query));

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPayment(req, res, next) {
  try {
    const { id } = req.params;
    const payment = await getPaymentById(id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}

export async function storePayment(req, res, next) {
  try {
    const parsed = createPaymentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const payment = await createPayment(parsed.data);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    logActivity({
      userId: req.user?.id,
      action: "PAYMENT_RECORDED",
      entity: "Payment",
      entityId: payment.id,
      req,
    });

    const assignedUserId = payment.order?.assignedUserId;
    if (assignedUserId && assignedUserId !== req.user?.id) {
      createNotification({
        title: "دفعة جديدة",
        message: `تم تسجيل دفعة بقيمة ${payment.amount} ${payment.currency} على الطلب ${payment.order.orderNumber}`,
        type: "PAYMENT_RECORDED",
        userId: assignedUserId,
        orderId: payment.orderId,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}
