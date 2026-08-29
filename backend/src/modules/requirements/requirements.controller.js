import { createRequirementSchema, updateRequirementSchema } from "./requirements.validators.js";
import {
  createRequirement,
  deleteRequirement,
  getPublicChecklist,
  listRequirements,
  updateRequirement,
} from "./requirements.service.js";
import { logActivity } from "../../utils/activityLog.js";

// Factory, not a fixed set of handlers: visa-types and services each own
// their own nested `/:parentId/requirements` routes, differing only in
// which req.param the parent id comes from and which VisaRequirement
// column that resolves to (visaTypeId vs serviceId). Keeps exactly one
// implementation of the checklist CRUD/logging/public-shape behavior
// instead of one copy per parent type.
export function makeRequirementsController({ paramName, scopeKey, entityLabel }) {
  function scopeFrom(req) {
    return { [scopeKey]: req.params[paramName] };
  }

  return {
    async getPublicRequirements(req, res, next) {
      try {
        const data = await getPublicChecklist(scopeFrom(req));
        return res.status(200).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    async getRequirements(req, res, next) {
      try {
        const data = await listRequirements(scopeFrom(req), { includeInactive: true });
        return res.status(200).json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },

    async storeRequirement(req, res, next) {
      try {
        const parsed = createRequirementSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

        const requirement = await createRequirement(scopeFrom(req), parsed.data);
        if (!requirement) return res.status(404).json({ success: false, message: `${entityLabel} not found` });

        logActivity({ userId: req.user?.id, action: "VISA_REQUIREMENT_CREATED", entity: "VisaRequirement", entityId: requirement.id, req });
        return res.status(201).json({ success: true, data: requirement });
      } catch (error) {
        next(error);
      }
    },

    async patchRequirement(req, res, next) {
      try {
        const parsed = updateRequirementSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

        const requirement = await updateRequirement(req.params.id, parsed.data);
        if (!requirement) return res.status(404).json({ success: false, message: "Requirement not found" });

        logActivity({ userId: req.user?.id, action: "VISA_REQUIREMENT_UPDATED", entity: "VisaRequirement", entityId: requirement.id, req });
        return res.status(200).json({ success: true, data: requirement });
      } catch (error) {
        next(error);
      }
    },

    async destroyRequirement(req, res, next) {
      try {
        const requirement = await deleteRequirement(req.params.id);
        if (!requirement) return res.status(404).json({ success: false, message: "Requirement not found" });

        logActivity({ userId: req.user?.id, action: "VISA_REQUIREMENT_DELETED", entity: "VisaRequirement", entityId: requirement.id, req });
        return res.status(200).json({ success: true, message: "Requirement deleted" });
      } catch (error) {
        next(error);
      }
    },
  };
}
