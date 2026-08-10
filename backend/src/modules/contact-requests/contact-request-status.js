// Translates the internal status/paymentStatus/document-presence combination
// into a customer-facing label — the internal ContactRequestStatus values
// (NEW/CONTACTED/CLOSED) are staff triage vocabulary, not something a
// customer should see verbatim. `needsDocuments`/`needsPayment` are kept
// separate from `label` (rather than folded into one string) because both
// can be true at once even though only one is ever headlined — e.g. a
// freshly-priced Umrah request is simultaneously "awaiting payment" and
// missing every document, and the tracking page needs to show both upload
// affordances regardless of which label won.
//
// Known simplification: CLOSED always reads "مكتمل" (Completed).
// ContactRequestStatus has no separate rejected/abandoned outcome today, so
// a declined request would misleadingly read as completed — accepted for
// now, to be revisited once a real terminal-outcome field exists.
//
// `hasPendingInvoice` (from the related Invoice row — see the Invoice model)
// is passed in rather than fetched here, keeping this a pure function: the
// caller already has the row via a Prisma `include`.
export function deriveCustomerFacingStatus(contactRequest) {
  const {
    status,
    paymentStatus,
    passportImagePaths,
    guarantorIdImagePaths,
    additionalDocumentPaths,
    hasPendingInvoice = false,
  } = contactRequest;

  const hasAnyDocuments =
    (passportImagePaths?.length ?? 0) > 0 ||
    (guarantorIdImagePaths?.length ?? 0) > 0 ||
    (additionalDocumentPaths?.length ?? 0) > 0;

  const needsDocuments = !hasAnyDocuments && status !== "CLOSED";
  const needsPayment = paymentStatus === "AWAITING_TRANSFER" && status !== "CLOSED";
  const needsInvoiceApproval = hasPendingInvoice && status !== "CLOSED";

  const label = (() => {
    if (status === "CLOSED") return "مكتمل";
    if (paymentStatus === "UNDER_REVIEW") return "قيد المراجعة";
    if (paymentStatus === "AWAITING_TRANSFER") return "بانتظار الدفع";
    if (needsInvoiceApproval) return "بانتظار موافقتك على السعر";
    if (!hasAnyDocuments) return "بانتظار المستندات";
    return "قيد المراجعة";
  })();

  return { label, needsDocuments, needsPayment, needsInvoiceApproval };
}
