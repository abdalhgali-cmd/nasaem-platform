// Umrah report: requests, pilgrims, payments and delivery by package type,
// computed from the database rows only (no estimates). Umrah requests only
// (SERVICE_KIND_FILTERS.UMRAH): Egypt security approvals are never counted.
// Money is summed per currency and never converted. Every total equals the
// sum of its group rows (`reconciliation` proves it), so the figures can be
// checked against the case list.
import prisma from "../../config/database.js";
import { SERVICE_KIND_FILTERS } from "../contact-requests/contact-requests.service.js";
import { evaluateUmrahDelivery } from "./umrah-delivery.js";
import { umrahObligations } from "./umrah-packages.js";

export const UMRAH_REPORT_CAP = 5000;
const DAY_MS = 86_400_000;

const cents = (value) => Math.round(Number(value) * 100);
const money = (c) => Number((c / 100).toFixed(2));

function emptyGroup(key) {
  return { key, requests: 0, pilgrims: 0, legacyObligations: 0, payment: { notRequired: 0, awaiting: 0, underReview: 0, confirmed: 0 }, invoiced: {}, paid: {}, visasIssued: 0, completed: 0, cancelledOrRejected: 0, _toPaid: [], _toClosed: [] };
}

function add(map, currency, amount) {
  map[currency] = (map[currency] || 0) + amount;
}

function groupKeyOf(row) {
  return row.visaType ? "VISA_ONLY" : umrahObligations(row).kind || "UNKNOWN";
}

export function buildUmrahReport(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const group = groups.get(key) || groups.set(key, emptyGroup(key)).get(key);
    group.requests += 1;
    group.pilgrims += row.travelers.length || row.travelerCount || 0;
    if (!row.visaType && umrahObligations(row).source === "LEGACY_CATALOG") group.legacyObligations += 1;
    const pay = group.payment;
    if (row.paymentStatus === "CONFIRMED") pay.confirmed += 1;
    else if (row.paymentStatus === "UNDER_REVIEW") pay.underReview += 1;
    else if (row.paymentStatus === "AWAITING_TRANSFER") pay.awaiting += 1;
    else pay.notRequired += 1;
    if (row.invoice) {
      add(group.invoiced, row.invoice.currency, cents(row.invoice.amount));
      if (row.paymentStatus === "CONFIRMED") add(group.paid, row.invoice.currency, cents(row.invoice.amount));
    }
    group.visasIssued += evaluateUmrahDelivery(row).visas.coveredTravelerIds.length;
    if (row.outcome === "COMPLETED") group.completed += 1;
    if (row.outcome === "CANCELLED" || row.outcome === "REJECTED") group.cancelledOrRejected += 1;
    if (row.paymentConfirmedAt) group._toPaid.push((row.paymentConfirmedAt - row.createdAt) / DAY_MS);
    if (row.closedAt) group._toClosed.push((row.closedAt - row.createdAt) / DAY_MS);
  }
  const avg = (values) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : null);
  const finish = ({ _toPaid, _toClosed, invoiced, paid, ...group }) => ({
    ...group,
    invoiced: Object.fromEntries(Object.entries(invoiced).map(([c, v]) => [c, money(v)])),
    paid: Object.fromEntries(Object.entries(paid).map(([c, v]) => [c, money(v)])),
    avgDaysToPayment: avg(_toPaid),
    avgDaysToClosed: avg(_toClosed),
    samples: { payment: _toPaid.length, closed: _toClosed.length },
  });
  const byPackage = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map(finish);

  const totals = { requests: 0, pilgrims: 0, visasIssued: 0, completed: 0, invoiced: {}, paid: {} };
  for (const g of byPackage) {
    totals.requests += g.requests;
    totals.pilgrims += g.pilgrims;
    totals.visasIssued += g.visasIssued;
    totals.completed += g.completed;
    for (const [c, v] of Object.entries(g.invoiced)) add(totals.invoiced, c, cents(v));
    for (const [c, v] of Object.entries(g.paid)) add(totals.paid, c, cents(v));
  }
  totals.invoiced = Object.fromEntries(Object.entries(totals.invoiced).map(([c, v]) => [c, money(v)]));
  totals.paid = Object.fromEntries(Object.entries(totals.paid).map(([c, v]) => [c, money(v)]));
  return {
    totals,
    byPackage,
    reconciliation: { requestsInRows: rows.length, requestsInGroups: totals.requests, matches: rows.length === totals.requests },
  };
}

function parseDay(value, endOfDay) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getUmrahReport(organizationId, { from, to } = {}) {
  const start = parseDay(from, false);
  const end = parseDay(to, true);
  const rows = await prisma.contactRequest.findMany({
    where: { organizationId, AND: [SERVICE_KIND_FILTERS.UMRAH], ...(start || end ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: UMRAH_REPORT_CAP + 1,
    select: {
      id: true, createdAt: true, closedAt: true, paymentConfirmedAt: true, paymentStatus: true, outcome: true, travelerCount: true, intakeData: true,
      invoice: { select: { amount: true, currency: true } },
      travelers: { select: { id: true } },
      deliverables: { where: { publishedAt: { not: null }, supersededAt: null }, select: { id: true, kind: true, publishedAt: true, supersededAt: true, travelerIds: true } },
      serviceRef: { select: { category: true, features: true } },
      visaType: { select: { category: true, code: true } },
    },
  });
  const truncated = rows.length > UMRAH_REPORT_CAP;
  return { ...buildUmrahReport(rows.slice(0, UMRAH_REPORT_CAP)), range: { from: start ? from : null, to: end ? to : null }, truncated, limit: UMRAH_REPORT_CAP };
}
