import { createServiceSchema, reorderServicesSchema, updateServiceSchema } from "./services.validators.js";
import {
  createService,
  deleteService,
  getServiceById,
  listPublicCatalog,
  listServices,
  reorderServices,
  setServiceImageKey,
  updateService,
} from "./services.service.js";
import { serviceImageKey } from "./services.constants.js";
import { upsertSiteAsset } from "../site-assets/site-assets.service.js";
import { logActivity } from "../../utils/activityLog.js";
import { parsePagination } from "../../utils/pagination.js";
import prisma from "../../config/database.js";

export async function getPublicCatalog(req, res, next) {
  try {
    const { services, visaTypes } = await listPublicCatalog();

    return res.status(200).json({
      success: true,
      data: { services, visaTypes },
    });
  } catch (error) {
    next(error);
  }
}

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

export async function patchReorder(req, res, next) {
  try {
    const parsed = reorderServicesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const services = await reorderServices(parsed.data.order);
    if (!services) return res.status(400).json({ success: false, message: "order must contain exactly the ids of existing services" });

    logActivity({ userId: req.user?.id, action: "SERVICES_REORDERED", entity: "Service", entityId: "bulk", req });
    return res.status(200).json({ success: true, data: services });
  } catch (error) {
    next(error);
  }
}

export async function uploadServiceImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const exists = await prisma.service.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ success: false, message: "Service not found" });

    const key = serviceImageKey(req.params.id);
    await upsertSiteAsset(key, req.file, req);
    const service = await setServiceImageKey(req.params.id, key);

    return res.status(200).json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
}
