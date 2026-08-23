import { createAirlineSchema, updateAirlineSchema } from "./airlines.validators.js";
import {
  createAirline,
  deleteAirline,
  listAirlines,
  listPublicAirlines,
  setAirlineLogoKey,
  updateAirline,
} from "./airlines.service.js";
import { airlineLogoKey } from "./airlines.constants.js";
import { upsertSiteAsset } from "../site-assets/site-assets.service.js";
import { logActivity } from "../../utils/activityLog.js";
import prisma from "../../config/database.js";

export async function getPublic(req, res, next) {
  try {
    const data = await listPublicAirlines();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAirlines(req, res, next) {
  try {
    const data = await listAirlines({ includeInactive: true });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function storeAirline(req, res, next) {
  try {
    const parsed = createAirlineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const airline = await createAirline(parsed.data);
    logActivity({ userId: req.user?.id, action: "AIRLINE_CREATED", entity: "Airline", entityId: airline.id, req, newValue: airline });
    return res.status(201).json({ success: true, data: airline });
  } catch (error) {
    next(error);
  }
}

export async function patchAirline(req, res, next) {
  try {
    const parsed = updateAirlineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const before = await prisma.airline.findUnique({ where: { id: req.params.id } });
    const airline = await updateAirline(req.params.id, parsed.data);
    if (!airline) return res.status(404).json({ success: false, message: "Airline not found" });

    logActivity({ userId: req.user?.id, action: "AIRLINE_UPDATED", entity: "Airline", entityId: airline.id, req, oldValue: before, newValue: airline });
    return res.status(200).json({ success: true, data: airline });
  } catch (error) {
    next(error);
  }
}

export async function destroyAirline(req, res, next) {
  try {
    const airline = await deleteAirline(req.params.id);
    if (!airline) return res.status(404).json({ success: false, message: "Airline not found" });

    logActivity({ userId: req.user?.id, action: "AIRLINE_DELETED", entity: "Airline", entityId: airline.id, req, oldValue: airline });
    return res.status(200).json({ success: true, message: "Airline removed" });
  } catch (error) {
    next(error);
  }
}

export async function uploadAirlineLogo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const exists = await prisma.airline.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) return res.status(404).json({ success: false, message: "Airline not found" });

    const key = airlineLogoKey(req.params.id);
    await upsertSiteAsset(key, req.file, req);
    const airline = await setAirlineLogoKey(req.params.id, key);

    return res.status(200).json({ success: true, data: airline });
  } catch (error) {
    next(error);
  }
}
