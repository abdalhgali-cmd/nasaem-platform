// The persisted ordering cache of the Umrah staff queue (model UmrahQueueEntry).
// Values are derived from the request's own facts by the same functions that
// build the case list (progress + umrahStaffQueue), so an entry can be thrown
// away and recreated at any time. The list orders and pages in SQL over this
// table, so there is no row limit; it re-derives the rows it shows and repairs
// any entry that disagrees (the cache is never trusted over the request).
import { packageKindOf } from "./umrah-queue-list.js";

// A cached row older than this is refreshed in the background by the list.
export const QUEUE_ENTRY_MAX_AGE_MS = 10 * 60 * 1000;
export const QUEUE_HEAL_BATCH = 100;
export const QUEUE_STALE_BATCH = 50;

export function entryData(row, progress, queue) {
  return {
    organizationId: row.organizationId,
    rank: queue?.rank ?? 9,
    stage: progress?.stage || "UNKNOWN",
    packageKind: packageKindOf(row),
    preferredTravelDate: queue?.preferredTravelDate || null,
    requestCreatedAt: row.createdAt,
  };
}

export function sameEntry(entry, data) {
  return (
    entry.rank === data.rank &&
    entry.stage === data.stage &&
    entry.packageKind === data.packageKind &&
    (entry.preferredTravelDate || null) === (data.preferredTravelDate || null)
  );
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
