import { createServiceSchema, updateServiceSchema } from "./services.validators.js";
import {
  createService,
  deleteService,
  getServiceById,
  listServices,
  updateService,
} from "./services.service.js";
import { parsePagination } from "../../utils/pagination.js";

export async function getServices(req, res, next) {
  try {
    const { data, meta } = await listServices(parsePagination(req.query));

    return res.status(200).json({
      success: true,
      data,
      meta,
    });
  } catch (error) {
    next(error);
  }
}

export async function getService(req, res, next) {
  try {
    const { id } = req.params;
    const service = await getServiceById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeService(req, res, next) {
  try {
    const parsed = createServiceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const service = await createService(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });
  } catch (error) {
    next(error);
  }
}

export async function patchService(req, res, next) {
  try {
    const { id } = req.params;
    const parsed = updateServiceSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const service = await updateService(id, parsed.data);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: service,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeService(req, res, next) {
  try {
    const { id } = req.params;
    const service = await deleteService(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service removed successfully",
    });
  } catch (error) {
    next(error);
  }
}
