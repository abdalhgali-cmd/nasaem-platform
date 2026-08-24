import {
  createOperatorSchema,
  createScheduleSchema,
  updateOperatorSchema,
  updateScheduleSchema,
} from "./ferries.validators.js";
import {
  createOperator,
  createSchedule,
  deleteOperator,
  deleteSchedule,
  getPublicDirectory,
  listOperators,
  listSchedules,
  setOperatorLogoKey,
  updateOperator,
  updateSchedule,
} from "./ferries.service.js";
import { ferryOperatorLogoKey } from "./ferries.constants.js";
import { upsertSiteAsset } from "../site-assets/site-assets.service.js";
import { logActivity } from "../../utils/activityLog.js";
import prisma from "../../config/database.js";

export async function getPublic(req, res, next) {
  try {
    const data = await getPublicDirectory();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// --- Operators ---

export async function getOperators(req, res, next) {
  try {
    const data = await listOperators({ includeInactive: true });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function storeOperator(req, res, next) {
  try {
    const parsed = createOperatorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const operator = await createOperator(parsed.data);
    logActivity({ userId: req.user?.id, action: "FERRY_OPERATOR_CREATED", entity: "FerryOperator", entityId: operator.id, req, newValue: operator });
    return res.status(201).json({ success: true, data: operator });
  } catch (error) {
    next(error);
  }
}

export async function patchOperator(req, res, next) {
  try {
    const parsed = updateOperatorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await prisma.ferryOperator.findUnique({ where: { id: req.params.id } });
    const operator = await updateOperator(req.params.id, parsed.data);
    if (!operator) return res.status(404).json({ success: false, message: "Ferry operator not found" });

    logActivity({ userId: req.user?.id, action: "FERRY_OPERATOR_UPDATED", entity: "FerryOperator", entityId: operator.id, req, oldValue: before, newValue: operator });
    return res.status(200).json({ success: true, data: operator });
  } catch (error) {
    next(error);
  }
}

export async function destroyOperator(req, res, next) {
  try {
    const operator = await deleteOperator(req.params.id);
    if (!operator) return res.status(404).json({ success: false, message: "Ferry operator not found" });

    logActivity({ userId: req.user?.id, action: "FERRY_OPERATOR_DELETED", entity: "FerryOperator", entityId: operator.id, req, oldValue: operator });
    return res.status(200).json({ success: true, message: "Ferry operator removed" });
  } catch (error) {
    next(error);
  }
}

export async function uploadOperatorLogo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const exists = await prisma.ferryOperator.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ success: false, message: "Ferry operator not found" });

    const key = ferryOperatorLogoKey(req.params.id);
    await upsertSiteAsset(key, req.file, req);
    const operator = await setOperatorLogoKey(req.params.id, key);

    return res.status(200).json({ success: true, data: operator });
  } catch (error) {
    next(error);
  }
}

// --- Schedules ---

export async function getSchedules(req, res, next) {
  try {
    const data = await listSchedules({ includeInactive: true });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function storeSchedule(req, res, next) {
  try {
    const parsed = createScheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const schedule = await createSchedule(req.params.operatorId, parsed.data);
    if (!schedule) return res.status(404).json({ success: false, message: "Ferry operator not found" });

    logActivity({ userId: req.user?.id, action: "FERRY_SCHEDULE_CREATED", entity: "FerrySchedule", entityId: schedule.id, req, newValue: schedule });
    return res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
}

export async function patchSchedule(req, res, next) {
  try {
    const parsed = updateScheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await prisma.ferrySchedule.findUnique({ where: { id: req.params.id } });
    const schedule = await updateSchedule(req.params.id, parsed.data);
    if (!schedule) return res.status(404).json({ success: false, message: "Ferry schedule not found" });

    logActivity({ userId: req.user?.id, action: "FERRY_SCHEDULE_UPDATED", entity: "FerrySchedule", entityId: schedule.id, req, oldValue: before, newValue: schedule });
    return res.status(200).json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
}

export async function destroySchedule(req, res, next) {
  try {
    const schedule = await deleteSchedule(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: "Ferry schedule not found" });

    logActivity({ userId: req.user?.id, action: "FERRY_SCHEDULE_DELETED", entity: "FerrySchedule", entityId: schedule.id, req, oldValue: schedule });
    return res.status(200).json({ success: true, message: "Ferry schedule removed" });
  } catch (error) {
    next(error);
  }
}
