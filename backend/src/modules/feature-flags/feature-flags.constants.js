// The fixed set from the plan's own list (Phase 13). Not admin-creatable
// — an admin can only toggle one of these, never add an arbitrary new
// key, since every key here corresponds to a specific server-side
// enforcement point wired elsewhere (see each module's routes.js).
export const FEATURE_FLAG_KEYS = [
  "PAYMENTS",
  "QUOTES",
  "DOCUMENTS",
  "PASSPORT_OCR",
  "WHATSAPP",
  "CUSTOMER_APPROVAL",
  "FLIGHT_SEARCH",
  "HOTEL_SEARCH",
  "SECURITY_APPROVAL",
  "CUSTOMER_UPLOAD",
  "STAFF_REVIEW",
];

export const FEATURE_FLAG_DESCRIPTIONS = {
  PAYMENTS: "Staff can confirm a customer's payment on a contact request.",
  QUOTES: "Staff can preview/issue a price quote, invoice or offer for a contact request.",
  DOCUMENTS: "Staff can upload a finished deliverable (issued visa, ticket, voucher) for a customer.",
  PASSPORT_OCR: "Passport MRZ scanning — both the standalone staff tool and automatic per-requirement extraction.",
  WHATSAPP: "Outbound WhatsApp notifications to staff and customers.",
  CUSTOMER_APPROVAL: "A customer can approve or reject a price quote from the tracking portal.",
  FLIGHT_SEARCH: "Public flight search (internal inventory + Trip.com).",
  HOTEL_SEARCH: "Hotel booking request intake.",
  SECURITY_APPROVAL: "Security approval service request intake (e.g. Egypt security clearance).",
  CUSTOMER_UPLOAD: "A customer can upload a document or payment receipt from the tracking portal.",
  STAFF_REVIEW: "Staff can accept/reject a customer-uploaded document.",
};

// Platform 3.0 Phase 13's HOTEL_SEARCH/SECURITY_APPROVAL flags gate
// contact-request creation for the specific, real Service categories
// that already exist for those capabilities (seeded in Phase 3/8) —
// deliberately not a guessed/invented heuristic for "any future service
// that might count as a security approval". See createContactRequest's
// feature-flag check and docs/PLATFORM-3-AUDIT.md-style disclosure in
// the execution plan's Phase 13 status note for this known boundary.
export const SERVICE_CATEGORY_FEATURE_FLAGS = {
  hotel: "HOTEL_SEARCH",
  egypt_clearance: "SECURITY_APPROVAL",
};
