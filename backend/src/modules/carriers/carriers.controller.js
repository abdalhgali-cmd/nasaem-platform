import { createCarrierSchema, updateCarrierSchema } from "./carriers.validators.js";
import { createCarrier, getCarrierById, listCarriers, updateCarrier } from "./carriers.service.js";

export async function getCarriers(req, res, next) {
  try {
    const { mode, active } = req.query;
    const carriers = await listCarriers({
      mode: mode || undefined,
      active: active === undefined ? undefined : active === "true",
    });

    return res.status(200).json({
      success: true,
      data: carriers,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCarrier(req, res, next) {
  try {
    const { id } = req.params;
    const carrier = await getCarrierById(id);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: "Carrier not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: carrier,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeCarrier(req, res, next) {
  try {
    const parsed = createCarrierSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const carrier = await createCarrier(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Carrier created successfully",
      data: carrier,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

export async function patchCarrier(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateCarrierSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const carrier = await updateCarrier(id, parsed.data);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        message: "Carrier not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Carrier updated successfully",
      data: carrier,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}
