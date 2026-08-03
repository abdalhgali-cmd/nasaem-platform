import { createPaymentSchema } from "./payments.validators.js";
import { createPayment, getPaymentById, listPayments } from "./payments.service.js";

export async function getPayments(req, res, next) {
  try {
    const payments = await listPayments();

    return res.status(200).json({
      success: true,
      data: payments,
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

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: payment,
    });
  } catch (error) {
    next(error);
  }
}
