// Smart Case Operations — Release F. The EMAIL provider channel's
// transport, following utils/whatsapp.js's established shape for an
// external sender: it composes and validates everything itself, and
// no-ops safely when the platform has no mail credentials configured.
//
// There is deliberately NO invented provider/credential here. Production
// delivery requires PROVIDER_EMAIL_* configuration the owner supplies; until
// then every send is recorded as NOT_CONFIGURED and the submission is
// stored with that failure reason rather than silently pretending a case
// was sent to an embassy that never received it.

function isConfigured() {
  return Boolean(process.env.PROVIDER_EMAIL_API_URL && process.env.PROVIDER_EMAIL_API_KEY);
}

// Test/dev transport: when PROVIDER_EMAIL_TRANSPORT=capture, sends are
// recorded in memory instead of dispatched, so the whole submission flow
// (recipient validation, package composition, audit record, status
// transitions) is exercisable end-to-end in tests and locally without any
// real mail account or a single real message leaving the machine.
const captured = [];

export function isCaptureTransport() {
  return process.env.PROVIDER_EMAIL_TRANSPORT === "capture";
}

export function getCapturedProviderEmails() {
  return captured;
}

export function clearCapturedProviderEmails() {
  captured.length = 0;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidRecipient(value) {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

// The message a provider actually receives. Deliberately plain and factual:
// the case reference, the service, the travelers by name, and the list of
// attached documents. Never the customer's phone/email or any passport
// number — a provider gets the documents themselves, and putting identity
// numbers in message bodies would scatter them into mail logs.
export function buildProviderEmailBody({ contactRequest, travelers, documents, notes }) {
  const lines = [
    `Case reference: ${contactRequest.id}`,
    `Service: ${contactRequest.service || contactRequest.serviceRef?.name || contactRequest.visaType?.name || "—"}`,
    `Customer: ${contactRequest.name}`,
  ];

  if (travelers.length) {
    lines.push("", "Travelers:");
    travelers.forEach((traveler, index) => lines.push(`  ${index + 1}. ${traveler.fullName}`));
  }

  lines.push("", `Attached documents (${documents.length}):`);
  documents.forEach((document) => lines.push(`  - ${document.label} (${document.fileName})`));

  if (notes) lines.push("", `Notes: ${notes}`);

  return lines.join("\n");
}

// Returns { sent: true } or { sent: false, reason } — never throws, and
// never reports success it can't stand behind.
export async function sendProviderEmail({ to, subject, body, attachments = [] }) {
  if (!isValidRecipient(to)) {
    return { sent: false, reason: "INVALID_RECIPIENT" };
  }

  if (isCaptureTransport()) {
    captured.push({ to, subject, body, attachmentCount: attachments.length, sentAt: new Date() });
    return { sent: true, transport: "capture" };
  }

  if (!isConfigured()) {
    return { sent: false, reason: "NOT_CONFIGURED" };
  }

  try {
    const response = await fetch(process.env.PROVIDER_EMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PROVIDER_EMAIL_API_KEY}`,
      },
      body: JSON.stringify({ to, subject, text: body }),
    });

    if (!response.ok) return { sent: false, reason: `PROVIDER_EMAIL_HTTP_${response.status}` };
    return { sent: true, transport: "api" };
  } catch (error) {
    return { sent: false, reason: "PROVIDER_EMAIL_UNREACHABLE" };
  }
}
