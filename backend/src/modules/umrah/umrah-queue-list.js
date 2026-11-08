// Server-side ordering and filtering of the staff Umrah list. The next step,
// stage and package type are derived from the whole case, so they cannot be
// a SQL ORDER BY; the list service loads the matching requests (bounded by
// UMRAH_QUEUE_CAP), derives them once, and this module orders/filters them
// before paging, so page 2 never contains something more urgent than page 1.
import { umrahObligations } from "./umrah-packages.js";

export const UMRAH_QUEUE_SORTS = new Set(["queue", "travel"]);
export const UMRAH_QUEUE_CAP = 500;

function packageKindOf(row) {
  return row.visaType ? "VISA_ONLY" : umrahObligations(row).kind || "UNKNOWN";
}

const dateOf = (item) => item.queue?.preferredTravelDate || null;

// Null dates last; then a stable tail (newest first, then id) so equal keys
// never reshuffle between two page requests.
function byDate(a, b) {
  const x = dateOf(a);
  const y = dateOf(b);
  if (x && y) return x < y ? -1 : x > y ? 1 : 0;
  if (x) return -1;
  if (y) return 1;
  return 0;
}

function tail(a, b) {
  const x = a.row.createdAt.getTime();
  const y = b.row.createdAt.getTime();
  if (x !== y) return y - x;
  return a.row.id < b.row.id ? 1 : a.row.id > b.row.id ? -1 : 0;
}

export function arrangeUmrahQueue(items, { sort, stage, packageKind } = {}) {
  const filtered = items.filter((item) => (!stage || item.progress?.stage === stage) && (!packageKind || packageKindOf(item.row) === packageKind));
  const rank = (item) => item.queue?.rank ?? 9;
  const compare =
    sort === "travel"
      ? (a, b) => byDate(a, b) || rank(a) - rank(b) || tail(a, b)
      : sort === "queue"
        ? (a, b) => rank(a) - rank(b) || byDate(a, b) || tail(a, b)
        : tail;
  return [...filtered].sort(compare);
}
