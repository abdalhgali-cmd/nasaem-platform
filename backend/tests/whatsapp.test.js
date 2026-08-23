import "./env.js";
import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { sendWhatsAppMessage } from "../src/utils/whatsapp.js";

describe("sendWhatsAppMessage", () => {
  const originalEnv = { ...process.env };
  let fetchCalls;
  let originalFetch;

  beforeEach(() => {
    delete process.env.WHATSAPP_API_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TEMPLATE_NAME;
    delete process.env.WHATSAPP_TEMPLATE_LANG;

    fetchCalls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true, text: async () => "" };
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  test("does nothing when WhatsApp is not configured", async () => {
    await sendWhatsAppMessage("249911034372", "hello");
    assert.equal(fetchCalls.length, 0);
  });

  test("does nothing when there is no recipient", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

    await sendWhatsAppMessage(undefined, "hello");
    assert.equal(fetchCalls.length, 0);
  });

  // Regression: Order-related callers (orders.service.js, payments.
  // controller.js) pass Customer.phone exactly as staff typed it — a
  // leading 0, spaces/dashes, a leading + — while the ContactRequest flow
  // already normalizes before calling this. Meta's API silently rejects
  // anything that isn't digits-only E.164 without the +, so an
  // un-normalized number here used to fail the send with no visible error
  // (best-effort — see the try/catch below). Normalizing centrally in
  // sendWhatsAppMessage fixes every caller at once.
  test("normalizes a locally-formatted recipient number before sending", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

    await sendWhatsAppMessage("0911 234-567", "hello");

    assert.equal(fetchCalls.length, 1);
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.to, "249911234567");
  });

  test("normalizes a +-prefixed international recipient number before sending", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

    await sendWhatsAppMessage("+249 91 123 4567", "hello");

    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.to, "249911234567");
  });

  test("does nothing when the recipient normalizes to nothing", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

    await sendWhatsAppMessage("not-a-phone-number", "hello");
    assert.equal(fetchCalls.length, 0);
  });

  test("sends a free-form text message when no template is configured", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";

    await sendWhatsAppMessage("249911034372", "طلب تواصل جديد");

    assert.equal(fetchCalls.length, 1);
    const { url, options } = fetchCalls[0];
    assert.ok(url.includes("/12345/messages"));
    assert.equal(options.headers.Authorization, "Bearer test-token");

    const body = JSON.parse(options.body);
    assert.equal(body.messaging_product, "whatsapp");
    assert.equal(body.to, "249911034372");
    assert.equal(body.type, "text");
    assert.equal(body.text.body, "طلب تواصل جديد");
  });

  test("sends a template message when WHATSAPP_TEMPLATE_NAME is set", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
    process.env.WHATSAPP_TEMPLATE_NAME = "contact_alert";
    process.env.WHATSAPP_TEMPLATE_LANG = "ar";

    await sendWhatsAppMessage("249911034372", "طلب تواصل جديد");

    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.type, "template");
    assert.equal(body.template.name, "contact_alert");
    assert.equal(body.template.language.code, "ar");
    assert.equal(body.template.components[0].parameters[0].text, "طلب تواصل جديد");
  });

  test("swallows fetch errors instead of throwing", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
    globalThis.fetch = async () => {
      throw new Error("network down");
    };

    await assert.doesNotReject(sendWhatsAppMessage("249911034372", "hello"));
  });

  test("swallows a non-OK API response instead of throwing", async () => {
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "invalid token" });

    await assert.doesNotReject(sendWhatsAppMessage("249911034372", "hello"));
  });
});
