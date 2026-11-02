import { normalizePhone } from "./phone.js";
import { isFeatureEnabled } from "../modules/feature-flags/feature-flags.service.js";

const GRAPH_API_VERSION = "v21.0";

function isConfigured() {
  return Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Platform 3.0 Phase 13: a synchronously-readable, stale-while-revalidate
// cache for the WHATSAPP flag. sendWhatsAppMessage is always called
// fire-and-forget (never awaited by its callers) specifically so a slow/
// unreachable WhatsApp API can never delay the request that triggered
// it; an `await` on a real DB query here, right before the dispatch,
// would reintroduce exactly that kind of delay into what every caller
// assumes is a synchronous kick-off. Reading a cached boolean keeps that
// guarantee — the flag can lag up to WHATSAPP_FLAG_TTL_MS behind a
// toggle, which is an acceptable trade for a notification channel.
const WHATSAPP_FLAG_TTL_MS = 10_000;
let whatsAppFlagCache = { enabled: true, checkedAt: 0 };

function refreshWhatsAppFlagCache() {
  isFeatureEnabled("WHATSAPP")
    .then((enabled) => { whatsAppFlagCache = { enabled, checkedAt: Date.now() }; })
    .catch(() => {});
}

function isWhatsAppFeatureEnabled() {
  if (Date.now() - whatsAppFlagCache.checkedAt > WHATSAPP_FLAG_TTL_MS) refreshWhatsAppFlagCache();
  return whatsAppFlagCache.enabled;
}

// Best-effort, same rationale as logActivity/createNotification: a WhatsApp
// send failure (missing config, Meta API error, network issue) must never
// break the operation that triggered it.
//
// Meta's Cloud API only allows free-form "text" messages to a number that
// has messaged the business's WhatsApp number within the last 24 hours. To
// notify staff outside that window (the common case here — staff never
// message the number themselves), set WHATSAPP_TEMPLATE_NAME to a message
// template already approved in Meta Business Manager; this sends that
// template with `body` as its single parameter instead of a free-form text
// message. See https://developers.facebook.com/docs/whatsapp/cloud-api.
//
// Resolves (never rejects) to what actually happened, for callers that keep
// a delivery record (customer-messages):
//   { status: "NOT_CONFIGURED" | "DISABLED" | "INVALID_RECIPIENT" }  nothing sent
//   { status: "ACCEPTED", providerMessageId }  Meta accepted the message
//     (not proof it reached the handset; that needs Meta's status webhooks)
//   { status: "FAILED", error }
// Fire-and-forget callers can keep ignoring the result.
export function whatsAppAvailability() {
  if (!isConfigured()) return "NOT_CONFIGURED";
  if (!isWhatsAppFeatureEnabled()) return "DISABLED";
  return "AVAILABLE";
}

// Same answer as whatsAppAvailability, but reads the WHATSAPP flag from the
// database instead of the cache: for callers that must not promise a message
// (the tracking OTP) and can afford one query.
export async function whatsAppReadiness() {
  if (!isConfigured()) return "NOT_CONFIGURED";
  const enabled = await isFeatureEnabled("WHATSAPP").catch(() => false);
  whatsAppFlagCache = { enabled, checkedAt: Date.now() };
  return enabled ? "AVAILABLE" : "DISABLED";
}

export async function sendWhatsAppMessage(to, body) {
  if (!isConfigured()) return { status: "NOT_CONFIGURED" };
  if (!to) return { status: "INVALID_RECIPIENT" };
  // Platform 3.0 Phase 13: gated at the source so every caller (order
  // notifications, contact-request notifications, tracking OTP, ...) is
  // covered by a single check instead of each needing its own.
  if (!isWhatsAppFeatureEnabled()) return { status: "DISABLED" };

  // Normalized here rather than trusted from the caller: the
  // ContactRequest flow already normalizes before calling this (it stores
  // phoneNormalized), but Order-related callers (orders.service.js,
  // payments.controller.js) pass Customer.phone as staff typed it —
  // whatever format that turns out to be (a leading 0, spaces, a leading
  // +, ...) — and Meta's API silently rejects anything that isn't
  // digits-only E.164 without the +. Normalizing centrally here means
  // every current and future caller gets this for free instead of each
  // one needing to remember to do it.
  const recipient = normalizePhone(to);
  if (!recipient) return { status: "INVALID_RECIPIENT" };

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_API_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" },
          components: [{ type: "body", parameters: [{ type: "text", text: body }] }],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body },
      };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("WhatsApp send failed:", response.status, detail);
      return { status: "FAILED", error: `HTTP ${response.status}` };
    }
    let json = {};
    try {
      json = typeof response.json === "function" ? await response.json() : {};
    } catch {
      json = {};
    }
    return { status: "ACCEPTED", providerMessageId: json?.messages?.[0]?.id || null };
  } catch (error) {
    console.error("WhatsApp send failed:", error);
    return { status: "FAILED", error: error?.message || "network error" };
  }
}
