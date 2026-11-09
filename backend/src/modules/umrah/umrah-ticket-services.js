import prisma from "../../config/database.js";
import { isUmrahRequest } from "./umrah-delivery.js";

// The service an optional post-visa booking opens, by transport mode.
export const UMRAH_TICKET_SERVICE_CODES = Object.freeze({ AIR: "SVC-FLIGHT", SEA: "SVC-FERRY" });

// Which booking services exist and are active, e.g. { AIR: true, SEA: false }.
// Read once per customer page, only when it lists an Umrah request, so the
// booking is never offered when its service is missing or switched off.
export async function umrahTicketServices(requests, db = prisma) {
  if (!requests.some(isUmrahRequest)) return null;
  const codes = Object.values(UMRAH_TICKET_SERVICE_CODES);
  const active = await db.service.findMany({ where: { code: { in: codes }, active: true }, select: { code: true } });
  const found = new Set(active.map((service) => service.code));
  return Object.fromEntries(Object.entries(UMRAH_TICKET_SERVICE_CODES).map(([mode, code]) => [mode, found.has(code)]));
}

// Attaches the availability to each request before its progress is derived.
export async function withUmrahTicketServices(requests, db = prisma) {
  const services = await umrahTicketServices(requests, db);
  return services ? requests.map((request) => (isUmrahRequest(request) ? { ...request, umrahTicketServices: services } : request)) : requests;
}
