import { requirementApplies } from "../requirements/requirements.service.js";

// Smart Case Operations — Release D (Customer Portal 2.0 / "طلباتي").
//
// The customer-facing counterpart of computeReadiness(): the same
// requirementsSnapshot and the same document rows, read the other way
// round — not "is this case ready for us to process" but "what is left for
// *you* to do". Nothing here queries; it is a pure function over data the
// tracking listing already loads, so it cannot leak anything the customer
// could not already see about their own request.
//
// Deliberately derived rather than stored: a checklist row is only ever a
// view of the snapshot plus the documents, so it can never drift out of
// sync with what staff see.

// A requirement is satisfied when the customer has an ACCEPTED, current
// document against it. PENDING means it is with us, not with them —
// which is why "under review" is a distinct state and never counted as
// something the customer still has to do.
const DOCUMENT_STATE = {
  ACCEPTED: "ACCEPTED",
  PENDING: "UNDER_REVIEW",
  REJECTED: "REJECTED",
};

function requirementLabel(requirement) {
  return requirement.name || requirement.nameEn || "مستند مطلوب";
}

export function buildCustomerChecklist(contactRequest) {
  const snapshot = contactRequest.requirementsSnapshot || [];
  const answers = contactRequest.intakeData?.answers || {};
  const currentDocuments = (contactRequest.documents || []).filter((d) => !d.supersededAt);
  const travelersById = new Map((contactRequest.travelers || []).map((t) => [t.id, t]));

  const items = [];

  for (const requirement of snapshot) {
    // A requirement whose condition does not hold was never asked of this
    // customer, so showing it as "missing" would be actively misleading.
    if (!requirementApplies(requirement, answers)) continue;

    const isDocument = !requirement.type || requirement.type === "DOCUMENT";

    if (isDocument) {
      // Newest first, matching the order the tracking listing loads them
      // in, so the row reflects the customer's most recent attempt.
      const document = currentDocuments.find((d) => d.requirementId === requirement.id);
      const state = document ? (DOCUMENT_STATE[document.status] ?? "MISSING") : "MISSING";
      const traveler = document?.travelerId ? travelersById.get(document.travelerId) : null;

      items.push({
        requirementId: requirement.id,
        label: requirementLabel(requirement),
        description: requirement.description ?? null,
        kind: "DOCUMENT",
        required: Boolean(requirement.required),
        state,
        documentId: document?.id ?? null,
        // The reason a document was sent back is the single most useful
        // thing we can tell the customer, so it travels with the row.
        reviewNote: state === "REJECTED" ? (document?.reviewNote ?? null) : null,
        travelerId: document?.travelerId ?? null,
        travelerName: traveler?.fullName ?? null,
      });
      continue;
    }

    const answer = answers[requirement.id];
    const answered = answer !== undefined && answer !== null && answer !== "";

    items.push({
      requirementId: requirement.id,
      label: requirementLabel(requirement),
      description: requirement.description ?? null,
      kind: "ANSWER",
      required: Boolean(requirement.required),
      state: answered ? "ANSWERED" : "MISSING",
      answer: answered ? String(answer) : null,
    });
  }

  return items;
}

// The action-first part of the portal: the short, ordered list of things
// only the customer can unblock. Anything waiting on *us* is deliberately
// absent — telling a customer to "wait" is not an action, and mixing the
// two is what makes a status page feel like it is asking for work that
// isn't theirs.
//
// Order is by how blocking each item is: a rejected document has already
// cost a round trip, a price decision blocks everything downstream, and a
// missing document is the ordinary case.
export function buildCustomerNextActions(contactRequest, checklist) {
  const actions = [];

  const rejected = checklist.filter((item) => item.state === "REJECTED");
  for (const item of rejected) {
    actions.push({
      code: "REPLACE_DOCUMENT",
      requirementId: item.requirementId,
      label: `إعادة رفع: ${item.label}`,
      reason: item.reviewNote,
    });
  }

  if (contactRequest.invoice?.status === "PENDING") {
    actions.push({ code: "REVIEW_INVOICE", label: "مراجعة السعر المقترح والموافقة عليه أو رفضه", reason: null });
  }

  if (contactRequest.offers?.length > 0 && !contactRequest.selectedOfferId) {
    actions.push({ code: "SELECT_OFFER", label: "اختيار أحد العروض المتاحة", reason: null });
  }

  const missingRequired = checklist.filter((item) => item.state === "MISSING" && item.required);
  for (const item of missingRequired) {
    actions.push({
      code: item.kind === "DOCUMENT" ? "UPLOAD_DOCUMENT" : "PROVIDE_ANSWER",
      requirementId: item.requirementId,
      label: item.kind === "DOCUMENT" ? `رفع: ${item.label}` : `استكمال: ${item.label}`,
      reason: null,
    });
  }

  if (contactRequest.paymentStatus === "AWAITING_TRANSFER") {
    actions.push({ code: "SEND_TRANSFER", label: "تحويل المبلغ ورفع إشعار الدفع", reason: null });
  }

  return actions;
}
