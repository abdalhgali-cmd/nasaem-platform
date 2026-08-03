import { createOrderSchema, updateOrderStatusSchema } from "./orders.validators.js";
import { createOrder, getOrderById, listOrders, updateOrderStatus } from "./orders.service.js";

export async function getOrders(req, res, next) {
  try {
    const orders = await listOrders();

    return res.status(200).json({
      success: true,
      data: orders,
    });
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

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
}
