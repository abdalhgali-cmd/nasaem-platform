// The persisted ordering cache of the Umrah staff queue (model UmrahQueueEntry).
// Values are derived from the request's own facts by the same functions that
// build the case list (progress + umrahStaffQueue), so an entry can be thrown
// away and recreated at any time. The list orders and pages in SQL over this
// table, so there is no row limit; it re-derives the rows it shows and repairs
// any entry that disagrees (the cache is never trusted over the request).
import { umrahJourney } from "./umrah-journey.js";
import { packageKindOf } from "./umrah-queue-list.js";

// A cached row older than this is refreshed in the background by the list.
export const QUEUE_ENTRY_MAX_AGE_MS = 10 * 60 * 1000;
export const QUEUE_HEAL_BATCH = 100;
export const QUEUE_STALE_BATCH = 50;

// The manager's attention facts, from the customer's own journey
// (umrah-journey.js), so the dashboard says "waiting on the customer"
// exactly when the customer's screen asks them to act.
export function attentionFacts(row, progress) {
  const journey = umrahJourney(row, progress);
  if (!journey) return { waitingOn: "NONE", partialVisas: false, delayedVisa: false };
  const open = progress?.stage !== "CLOSED";
  const pilgrims = journey.pilgrims.length;
  return {
    waitingOn: open ? journey.now.actor : "NONE",
    partialVisas: open && journey.visasIssued > 0 && journey.visasIssued < pilgrims,
    delayedVisa: open && journey.pilgrims.some((p) => p.visa === "DELAYED"),
  };
}

export function entryData(row, progress, queue) {
  return {
    organizationId: row.organizationId,
    rank: queue?.rank ?? 9,
    stage: progress?.stage || "UNKNOWN",
    packageKind: packageKindOf(row),
    preferredTravelDate: queue?.preferredTravelDate || null,
    requestCreatedAt: row.createdAt,
    ...attentionFacts(row, progress),
  };
}

export function sameEntry(entry, data) {
  return (
    entry.rank === data.rank &&
    entry.stage === data.stage &&
    entry.packageKind === data.packageKind &&
    (entry.preferredTravelDate || null) === (data.preferredTravelDate || null) &&
    entry.waitingOn === data.waitingOn &&
    entry.partialVisas === data.partialVisas &&
    entry.delayedVisa === data.delayedVisa
  );
}

// Manager views of the open Umrah work, decided over the whole result set
// (never one page). Overdue with the agency = the agency acts next and either
// the staff due date has passed or a pilgrim's visa is marked delayed; no
// time threshold is invented here.
export const UMRAH_FOCUS = Object.freeze(["UNASSIGNED", "AGENCY_OVERDUE", "WAITING_CUSTOMER", "PARTIAL_VISAS"]);

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// { request, entry }: conditions on ContactRequest and on UmrahQueueEntry.
export function focusWhere(focus, now = new Date()) {
  const open = { status: { not: "CLOSED" } };
  switch (focus) {
    case "UNASSIGNED": return { request: { ...open, assignedUserId: null }, entry: {} };
    case "WAITING_CUSTOMER": return { request: open, entry: { waitingOn: "CUSTOMER" } };
    case "PARTIAL_VISAS": return { request: open, entry: { partialVisas: true } };
    case "AGENCY_OVERDUE": return { request: open, entry: { waitingOn: "AGENCY", OR: [{ delayedVisa: true }, { contactRequest: { dueAt: { lt: startOfToday(now) } } }] } };
    default: return null;
  }
}

// The same rule in memory, for the bounded sweep used while the index builds.
export function focusMatches(focus, row, facts, now = new Date()) {
  if (row.status === "CLOSED") return false;
  switch (focus) {
    case "UNASSIGNED": return !row.assignedUserId;
    case "WAITING_CUSTOMER": return facts.waitingOn === "CUSTOMER";
    case "PARTIAL_VISAS": return facts.partialVisas;
    case "AGENCY_OVERDUE": return facts.waitingOn === "AGENCY" && (facts.delayedVisa || Boolean(row.dueAt && new Date(row.dueAt) < startOfToday(now)));
    default: return true;
  }
}

// Same order as arrangeUmrahQueue (umrah-queue-list.js): equal keys end with
// the newest request and then the id, so a page request never reshuffles.
export function queueOrderBy(sort) {
  const date = { preferredTravelDate: { sort: "asc", nulls: "last" } };
  const tail = [{ requestCreatedAt: "desc" }, { contactRequestId: "desc" }];
  if (sort === "travel") return [date, { rank: "asc" }, ...tail];
  if (sort === "queue") return [{ rank: "asc" }, date, ...tail];
  return tail;
}
