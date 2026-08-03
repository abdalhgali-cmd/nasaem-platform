import { createCustomerSchema } from "./customers.validators.js";
import { createCustomer, getCustomerById, listCustomers } from "./customers.service.js";

export async function getCustomers(req, res, next) {
  try {
    const customers = await listCustomers();

    return res.status(200).json({
      success: true,
      data: customers,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const customer = await getCustomerById(id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeCustomer(req, res, next) {
  try {
    const parsed = createCustomerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const customer = await createCustomer(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}
