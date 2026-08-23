import { createAirportSchema, searchAirportsSchema, updateAirportSchema } from "./airports.validators.js";
import { createAirport, deleteAirport, listAirports, searchAirports, updateAirport } from "./airports.service.js";
import { logActivity } from "../../utils/activityLog.js";
import { parsePagination } from "../../utils/pagination.js";

// Public: powers flight-search origin/destination typeahead (this phase
// and, later, Phase 12) with no staff session available — same posture
// as GET /api/airlines/public.
export async function getSearch(req, res, next) {
  try {
    const parsed = searchAirportsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const data = await searchAirports(parsed.data.q, { limit: parsed.data.limit });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAirports(req, res, next) {
  try {
    const { data, meta } = await listAirports(parsePagination(req.query));
    return res.status(200).json({ success: true, data, meta });
  } catch (error) {
    next(error);
  }
}

export async function storeAirport(req, res, next) {
  try {
    const parsed = createAirportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const airport = await createAirport(parsed.data);
    logActivity({ userId: req.user?.id, action: "AIRPORT_CREATED", entity: "Airport", entityId: airport.id, req });
    return res.status(201).json({ success: true, data: airport });
  } catch (error) {
    next(error);
  }
}

export async function patchAirport(req, res, next) {
  try {
    const parsed = updateAirportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.flatten() });

    const airport = await updateAirport(req.params.id, parsed.data);
    if (!airport) return res.status(404).json({ success: false, message: "Airport not found" });

    logActivity({ userId: req.user?.id, action: "AIRPORT_UPDATED", entity: "Airport", entityId: airport.id, req });
    return res.status(200).json({ success: true, data: airport });
  } catch (error) {
    next(error);
  }
}

export async function destroyAirport(req, res, next) {
  try {
    const airport = await deleteAirport(req.params.id);
    if (!airport) return res.status(404).json({ success: false, message: "Airport not found" });

    logActivity({ userId: req.user?.id, action: "AIRPORT_DELETED", entity: "Airport", entityId: airport.id, req });
    return res.status(200).json({ success: true, message: "Airport removed" });
  } catch (error) {
    next(error);
  }
}
