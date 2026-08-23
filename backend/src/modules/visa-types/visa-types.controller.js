import {
  createVisaRequirementSchema,
  createVisaTypeSchema,
  reorderVisaTypesSchema,
  updateVisaRequirementSchema,
  updateVisaTypeSchema,
} from "./visa-types.validators.js";
import {
  createRequirement,
  createVisaType,
  deleteRequirement,
  deleteVisaType,
  getPublicChecklist,
  getVisaTypeById,
  listRequirements,
  listVisaTypes,
  reorderVisaTypes,
  updateRequirement,
  updateVisaType,
} from "./visa-types.service.js";
import { logActivity } from "../../utils/activityLog.js";
import { parsePagination } from "../../utils/pagination.js";

export async function getVisaTypes(req, res, next) {
  try {
    const { data, meta } = await listVisaTypes(parsePagination(req.query));
    return res.status(200).json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
}

export async function getVisaType(req, res, next) {
  try {
    const visaType = await getVisaTypeById(req.params.id);
    if (!visaType) return res.status(404).json({ success: false, message: "Visa type not found" });
    return res.status(200).json({ success: true, data: visaType });
  } catch (error) {
    next(error);
  }
}

export async function storeVisaType(req, res, next) {
  try {
    const parsed = createVisaTypeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const visaType = await createVisaType(parsed.data);
    logActivity({ userId: req.user?.id, action: "VISA_TYPE_CREATED", entity: "VisaType", entityId: visaType.id, req });
    return res.status(201).json({ success: true, message: "Visa type created successfully", data: visaType });
  } catch (error) {
    next(error);
  }
}

export async function patchVisaType(req, res, next) {
  try {
    const parsed = updateVisaTypeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const visaType = await updateVisaType(req.params.id, parsed.data);
    if (!visaType) return res.status(404).json({ success: false, message: "Visa type not found" });

    logActivity({ userId: req.user?.id, action: "VISA_TYPE_UPDATED", entity: "VisaType", entityId: visaType.id, req });
    return res.status(200).json({ success: true, message: "Visa type updated successfully", data: visaType });
  } catch (error) {
    next(error);
  }
}

export async function removeVisaType(req, res, next) {
  try {
    const visaType = await deleteVisaType(req.params.id);
    if (!visaType) return res.status(404).json({ success: false, message: "Visa type not found" });

    logActivity({ userId: req.user?.id, action: "VISA_TYPE_DELETED", entity: "VisaType", entityId: visaType.id, req });
    return res.status(200).json({ success: true, message: "Visa type removed successfully" });
  } catch (error) {
    next(error);
  }
}

export async function patchReorder(req, res, next) {
  try {
    const parsed = reorderVisaTypesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const visaTypes = await reorderVisaTypes(parsed.data.order);
    if (!visaTypes) return res.status(400).json({ success: false, message: "order must contain exactly the ids of existing visa types" });

    logActivity({ userId: req.user?.id, action: "VISA_TYPES_REORDERED", entity: "VisaType", entityId: "bulk", req });
    return res.status(200).json({ success: true, data: visaTypes });
  } catch (error) {
    next(error);
  }
}

// --- Requirements checklist (Platform 3.0 Phase 5) ---

export async function getPublicRequirements(req, res, next) {
  try {
    const data = await getPublicChecklist(req.params.visaTypeId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getRequirements(req, res, next) {
  try {
    const data = await listRequirements(req.params.visaTypeId, { includeInactive: true });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function storeRequirement(req, res, next) {
  try {
    const parsed = createVisaRequirementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const requirement = await createRequirement(req.params.visaTypeId, parsed.data);
    if (!requirement) return res.status(404).json({ success: false, message: "Visa type not found" });

    logActivity({ userId: req.user?.id, action: "VISA_REQUIREMENT_CREATED", entity: "VisaRequirement", entityId: requirement.id, req });
    return res.status(201).json({ success: true, data: requirement });
  } catch (error) {
    next(error);
  }
}

export async function patchRequirement(req, res, next) {
  try {
    const parsed = updateVisaRequirementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const requirement = await updateRequirement(req.params.id, parsed.data);
    if (!requirement) return res.status(404).json({ success: false, message: "Requirement not found" });

    logActivity({ userId: req.user?.id, action: "VISA_REQUIREMENT_UPDATED", entity: "VisaRequirement", entityId: requirement.id, req });
    return res.status(200).json({ success: true, data: requirement });
  } catch (error) {
    next(error);
  }
}

export async function destroyRequirement(req, res, next) {
  try {
    const requirement = await deleteRequirement(req.params.id);
    if (!requirement) return res.status(404).json({ success: false, message: "Requirement not found" });

    logActivity({ userId: req.user?.id, action: "VISA_REQUIREMENT_DELETED", entity: "VisaRequirement", entityId: requirement.id, req });
    return res.status(200).json({ success: true, message: "Requirement deleted" });
  } catch (error) {
    next(error);
  }
}
