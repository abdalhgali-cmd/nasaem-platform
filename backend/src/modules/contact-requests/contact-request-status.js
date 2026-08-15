import { EXECUTION_STAGE_LABELS_AR, TERMINAL_EXECUTION_STAGES } from "./contact-request-execution.js";

// Translates the internal status/paymentStatus/document-presence/
// executionStage combination into a customer-facing label — the internal
// ContactRequestStatus values (NEW/CONTACTED/CLOSED) are staff triage
// vocabulary, not something a customer should see verbatim.
// `needsDocuments`/`needsPayment` are kept separate from `label` (rather
// than folded into one string) because both can be true at once even
// though only one is ever headlined — e.g. a freshly-priced Umrah request
// is simultaneously "awaiting payment" and missing every document, and the
// tracking page needs to show both upload affordances regardless of which
// label won.
//
// `hasPendingInvoice` (from the related Invoice row — see the Invoice model)
// is passed in rather than fetched here, keeping this a pure function: the
// caller already has the row via a Prisma `include`. `documents` is the
// request's ContactRequestDocument rows ({ type, status, createdAt,
// updatedAt }[]) — replaces the old flat path arrays now that each upload
// has its own reviewable status. `executionStage` is the request's
// ContactRequestExecutionStage or null — see contact-request-execution.js.
export function deriveCustomerFacingStatus(contactRequest) {
  const {
    status,
    paymentStatus,
    documents = [],
    hasPendingInvoice = false,
    hasPendingOffers = false,
    executionStage = null,
  } = contactRequest;

  // FINAL documents are staff-authored deliverables, not something the
  // customer uploaded — they must never count toward "the customer has
  // uploaded something" or be candidates for "needs re-upload".
  const customerDocuments = documents.filter((d) => d.type !== "FINAL");
  const hasAnyDocuments = customerDocuments.length > 0;

  // A REJECTED row still needs action unless a *later* document of the same
  // type exists — checked per row, not "latest per type", since this app's
  // real uploads don't always supersede each other 1:1 (Umrah's per-traveler
  // batch creates several PASSPORT rows for different people; a visa's
  // ADDITIONAL bucket bundles several distinct documents in one batch).
  const needsReupload =
    status !== "CLOSED" &&
    customerDocuments.some(
      (d) =>
        d.status === "REJECTED" &&
        !customerDocuments.some((other) => other.type === d.type && other.createdAt > d.updatedAt)
    );

  const needsDocuments = !hasAnyDocuments && status !== "CLOSED";
  const needsPayment = paymentStatus === "AWAITING_TRANSFER" && status !== "CLOSED";
  const needsInvoiceApproval = hasPendingInvoice && status !== "CLOSED";
  const needsOfferApproval = hasPendingOffers && status !== "CLOSED";

  const isTerminalStage = executionStage != null && TERMINAL_EXECUTION_STAGES.includes(executionStage);
  const inExecution = executionStage != null && !isTerminalStage && status !== "CLOSED";
  const outcome =
    executionStage === "DELIVERED_TO_CUSTOMER"
      ? "SUCCESS"
      : executionStage === "CANCELLED" || executionStage === "VISA_REJECTED"
        ? "CANCELLED"
        : null;
  const executionStageLabel = executionStage ? EXECUTION_STAGE_LABELS_AR[executionStage] : null;

  const label = (() => {
    // A request CLOSED before execution tracking existed (or a simple
    // inquiry that never used it) still reads exactly as it always has —
    // no data migration, no regression.
    if (status === "CLOSED") {
      if (executionStage === "DELIVERED_TO_CUSTOMER") return "مكتمل بنجاح";
      if (executionStage === "CANCELLED") return "تم الإلغاء";
      if (executionStage === "VISA_REJECTED") return "تم رفض التأشيرة";
      return "مكتمل";
    }
    // A cancelled/rejected request is terminal news — telling a customer
    // "بانتظار الدفع" for a request that was cancelled would be actively
    // wrong, so this ranks above the payment/document tiers below.
    if (executionStage === "CANCELLED") return "تم الإلغاء";
    if (executionStage === "VISA_REJECTED") return "تم رفض التأشيرة";
    if (needsReupload) return "يوجد مستند يحتاج إعادة رفع";
    if (paymentStatus === "UNDER_REVIEW") return "قيد المراجعة";
    if (paymentStatus === "AWAITING_TRANSFER") return "بانتظار الدفع";
    if (needsInvoiceApproval || needsOfferApproval) return "بانتظار موافقتك على السعر";
    // Ranked above "!hasAnyDocuments": a request can legitimately enter
    // execution with zero customer-uploaded documents (a flight booking
    // needs none) — a customer whose tickets are already issued must not
    // see "بانتظار المستندات".
    if (executionStage != null) return executionStageLabel;
    if (!hasAnyDocuments) return "بانتظار المستندات";
    return "قيد المراجعة";
  })();

  return {
    label,
    needsDocuments,
    needsPayment,
    needsInvoiceApproval,
    needsOfferApproval,
    needsReupload,
    inExecution,
    executionStageLabel,
    outcome,
  };
}
