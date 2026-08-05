const GRAPH_API_VERSION = "v21.0";

function isConfigured() {
  return Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
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
export async function sendWhatsAppMessage(to, body) {
  if (!isConfigured() || !to) return;

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_API_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;

  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" },
          components: [{ type: "body", parameters: [{ type: "text", text: body }] }],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
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
      }
    );

    if (!response.ok) {
      console.error("WhatsApp send failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("WhatsApp send failed:", error);
  }
}
