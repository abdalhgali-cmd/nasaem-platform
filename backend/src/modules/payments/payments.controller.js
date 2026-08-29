import { createPaymentSchema, rejectPaymentSchema } from "./payments.validators.js";
import { confirmPayment, createPayment, getPaymentById, listPayments, rejectPayment } from "./payments.service.js";
import { parsePagination } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";
import { sendWhatsAppMessage } from "../../utils/whatsapp.js";

export async function getPayments(req, res, next) {
  try {
    const { data, meta } = await listPayments({
      ...parsePagination(req.query),
      status: req.query.status,
      reviewStatus: req.query.reviewStatus,
      orderId: req.query.orderId,
      organizationId: req.user.organizationId,
    });

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
    const payment = await getPaymentById(id, req.user.organizationId);

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

    const payment = await createPayment(parsed.data, req.user.organizationId);

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
    const pendingReview = payment.reviewStatus === "PENDING";
    if (assignedUserId && assignedUserId !== req.user?.id) {
      createNotification({
        title: pendingReview ? "دفعة بانتظار المراجعة" : "دفعة جديدة",
        message: pendingReview
          ? `دفعة بقيمة ${payment.amount} ${payment.currency} على الطلب ${payment.order.orderNumber} بانتظار مراجعتك`
          : `تم تسجيل دفعة بقيمة ${payment.amount} ${payment.currency} على الطلب ${payment.order.orderNumber}`,
        type: pendingReview ? "PAYMENT_PENDING_REVIEW" : "PAYMENT_RECORDED",
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

export async function confirmPaymentAction(req, res, next) {
  try {
    const { id } = req.params;
    const payment = await confirmPayment(id, req.user?.id, req.user.organizationId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    logActivity({ userId: req.user?.id, action: "PAYMENT_CONFIRMED", entity: "Payment", entityId: payment.id, req });

    if (payment.order?.customer?.phone) {
      sendWhatsAppMessage(
        payment.order.customer.phone,
        `تم تأكيد دفعتك بقيمة ${payment.amount} ${payment.currency} على الطلب ${payment.order.orderNumber}.`,
      );
    }

    return res.status(200).json({ success: true, message: "Payment confirmed successfully", data: payment });
  } catch (error) {
    next(error);
  }
}

export async function rejectPaymentAction(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = rejectPaymentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const payment = await rejectPayment(id, req.user?.id, parsed.data.reason, req.user.organizationId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    logActivity({ userId: req.user?.id, action: "PAYMENT_REJECTED", entity: "Payment", entityId: payment.id, req });

    if (payment.order?.customer?.phone) {
      sendWhatsAppMessage(
        payment.order.customer.phone,
        `تعذر تأكيد دفعتك على الطلب ${payment.order.orderNumber}: ${payment.rejectionReason}. يرجى التواصل معنا.`,
      );
    }

    return res.status(200).json({ success: true, message: "Payment rejected", data: payment });
  } catch (error) {
    next(error);
  }
}
