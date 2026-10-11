// What the customer still has to do on a request, from the checklist the API
// derives (per document and per traveler). Pure functions: tested in
// tests/checklist-view.test.mjs.

const STATE_LABELS = {
  MISSING: "لم يُرفع",
  UNDER_REVIEW: "قيد المراجعة",
  ACCEPTED: "مقبول",
  REJECTED: "مرفوض",
  ANSWERED: "تم",
};

export const stateLabel = (state) => STATE_LABELS[state] || state;

// A document can be (re)uploaded when it is missing or was sent back.
export function canUpload(item) {
  return item?.kind === "DOCUMENT" && (item.state === "MISSING" || item.state === "REJECTED");
}

// Items that block the customer, first: rejected, then missing required ones.
export function actionCount(checklist = []) {
  return checklist.filter((item) => item.state === "REJECTED" || (item.state === "MISSING" && item.required)).length;
}

// Groups document rows by traveler (each traveler's documents together), then
// the request-wide documents and the questions.
export function groupChecklist(checklist = []) {
  const groups = [];
  const byTraveler = new Map();
  for (const item of checklist.filter((entry) => entry.kind === "DOCUMENT")) {
    if (item.travelerId) {
      if (!byTraveler.has(item.travelerId)) {
        const group = { key: item.travelerId, title: item.travelerName || "مسافر", items: [] };
        byTraveler.set(item.travelerId, group);
        groups.push(group);
      }
      byTraveler.get(item.travelerId).items.push(item);
    }
  }
  const shared = checklist.filter((entry) => entry.kind === "DOCUMENT" && !entry.travelerId);
  if (shared.length) groups.push({ key: "case", title: "مستندات الطلب", items: shared });
  const answers = checklist.filter((entry) => entry.kind === "ANSWER");
  if (answers.length) groups.push({ key: "answers", title: "معلومات الطلب", items: answers });
  return groups;
}

// The label stored with an uploaded document: which document, whose.
export function uploadLabel(item) {
  return item.travelerName ? `${item.label} — ${item.travelerName}` : item.label;
}
