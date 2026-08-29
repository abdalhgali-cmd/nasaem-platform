import { createVisaTypeSchema, reorderVisaTypesSchema, updateVisaTypeSchema } from "./visa-types.validators.js";
import { createVisaType, deleteVisaType, getVisaTypeById, listVisaTypes, reorderVisaTypes, updateVisaType } from "./visa-types.service.js";
import { makeRequirementsController } from "../requirements/requirements.controller.js";
import { logActivity } from "../../utils/activityLog.js";
import { parsePagination } from "../../utils/pagination.js";
import { VISA_TYPE_CATEGORIES } from "../../utils/enums.js";

export async function getVisaTypes(req, res, next) {
  try {
    // Optional ?category= filter (admin catalog management) — an unknown
    // value is ignored rather than 400ing, since this is a list-narrowing
    // convenience, not a write.
    const category = VISA_TYPE_CATEGORIES.includes(req.query.category) ? req.query.category : undefined;
    const { data, meta } = await listVisaTypes(parsePagination(req.query), { category });
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
    logActivity({ userId: req.user?.id, action: "VISA_TYPE_CREATED", entity: "VisaType", entityId: visaType.id, req, newValue: visaType });
    return res.status(201).json({ success: true, message: "Visa type created successfully", data: visaType });
  } catch (error) {
    next(error);
  }
}

export async function patchVisaType(req, res, next) {
  try {
    const parsed = updateVisaTypeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await getVisaTypeById(req.params.id);
    const visaType = await updateVisaType(req.params.id, parsed.data);
    if (!visaType) return res.status(404).json({ success: false, message: "Visa type not found" });

    logActivity({ userId: req.user?.id, action: "VISA_TYPE_UPDATED", entity: "VisaType", entityId: visaType.id, req, oldValue: before, newValue: visaType });
    return res.status(200).json({ success: true, message: "Visa type updated successfully", data: visaType });
  } catch (error) {
    next(error);
  }
}

export async function removeVisaType(req, res, next) {
  try {
    const visaType = await deleteVisaType(req.params.id);
    if (!visaType) return res.status(404).json({ success: false, message: "Visa type not found" });

    logActivity({ userId: req.user?.id, action: "VISA_TYPE_DELETED", entity: "VisaType", entityId: visaType.id, req, oldValue: visaType });
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

    logActivity({ userId: req.user?.id, action: "VISA_TYPES_REORDERED", entity: "VisaType", entityId: "bulk", req, newValue: { order: parsed.data.order } });
    return res.status(200).json({ success: true, data: visaTypes });
  } catch (error) {
    next(error);
  }
}

// --- Requirements checklist (Platform 3.0 Phase 5; shared engine
// generalized in Phase 8 — see requirements/requirements.controller.js) ---

export const { getPublicRequirements, getRequirements, storeRequirement, patchRequirement, destroyRequirement } =
  makeRequirementsController({ paramName: "visaTypeId", scopeKey: "visaTypeId", entityLabel: "Visa type" });
