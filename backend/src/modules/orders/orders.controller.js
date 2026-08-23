import { assignOrderSchema, createOrderSchema, setItemCostSchema, updateOrderStatusSchema } from "./orders.validators.js";
import { assignOrder, createOrder, getOrderById, listOrders, setItemSupplierCost, updateOrderStatus } from "./orders.service.js";
import { parsePagination } from "../../utils/pagination.js";
import { logActivity } from "../../utils/activityLog.js";
import { createNotification } from "../../utils/notifications.js";

export async function getOrders(req, res, next) {
  try {
    const { data, meta } = await listOrders({
      ...parsePagination(req.query),
      status: req.query.status,
      paymentStatus: req.query.paymentStatus,
      assignedUserId: req.query.assignedUserId,
      serviceId: req.query.serviceId,
      search: req.query.search,
      stalledHours: req.query.stalledHours ? Number(req.query.stalledHours) : null,
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

export async function assignOrderAction(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = assignOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const order = await assignOrder(id, parsed.data.assignedUserId, req.user?.id);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    logActivity({ userId: req.user?.id, action: "ORDER_ASSIGNED", entity: "Order", entityId: order.id, req });

    return res.status(200).json({ success: true, message: "Order assigned successfully", data: order });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req, res, next) {
  try {
    const { id } = req.params;
    const order = await getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeOrder(req, res, next) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const order = await createOrder(parsed.data, req.user?.id);

    logActivity({
      userId: req.user?.id,
      action: "ORDER_CREATED",
      entity: "Order",
      entityId: order.id,
      req,
    });

    if (order.assignedUserId && order.assignedUserId !== req.user?.id) {
      createNotification({
        title: "طلب جديد مُسند إليك",
        message: `تم إسناد الطلب ${order.orderNumber} إليك`,
        type: "ORDER_ASSIGNED",
        userId: order.assignedUserId,
        orderId: order.id,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
}

export async function changeOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateOrderStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const order = await updateOrderStatus(id, parsed.data.status, req.user?.id, parsed.data.notes || null);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    logActivity({
      userId: req.user?.id,
      action: "ORDER_STATUS_CHANGED",
      entity: "Order",
      entityId: order.id,
      req,
    });

    if (order.assignedUserId && order.assignedUserId !== req.user?.id) {
      createNotification({
        title: "تحديث حالة الطلب",
        message: `تم تغيير حالة الطلب ${order.orderNumber} إلى ${order.status}`,
        type: "ORDER_STATUS_CHANGED",
        userId: order.assignedUserId,
        orderId: order.id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
}

export async function setOrderItemCost(req, res, next) {
  try {
    const parsed = setItemCostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });
    }

    const item = await setItemSupplierCost(req.params.id, req.params.itemId, parsed.data);
    if (!item) {
      return res.status(404).json({ success: false, message: "Order item not found" });
    }

    logActivity({ userId: req.user?.id, action: "ORDER_ITEM_COST_SET", entity: "OrderItem", entityId: item.id, req });

    return res.status(200).json({ success: true, message: "Item cost updated successfully", data: item });
  } catch (error) {
    next(error);
  }
}
