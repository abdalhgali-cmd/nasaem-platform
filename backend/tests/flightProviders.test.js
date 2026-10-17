import "./env.js";
import http from "node:http";
import { after, afterEach, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import {
  PROVIDERS,
  listProviderStatuses,
  providerConfig,
  providerStatus,
  registerProviderAdapter,
  unregisterProviderAdapter,
} from "../src/modules/flight-providers/provider-registry.js";
import { normalizeProviderOffer } from "../src/modules/flight-providers/offer-normalize.js";
import { providerRequest } from "../src/modules/flight-providers/provider-http.js";
import { confirmProviderBooking } from "../src/modules/flight-providers/booking-gate.js";

// Issue #109: provider adapters are contract-tested against a local mock
// provider only — no real provider agreement or credentials exist. Every
// real provider stays REQUEST_ONLY.

const SECRET_TOKEN = `secret-token-${uniqueSuffix()}`;
const PASSENGER = { fullName: "AHMED MOHAMED", passportNo: "SD1234567" };
const future = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

function rawOffer(overrides = {}) {
  return {
    offerId: "OF-1",
    currency: "usd",
    total: 420,
    validUntil: future(1),
    cabin: "Y",
    baggage: { pieces: 1, weightKg: 23 },
    passengerPrices: { ADULT: { amount: 300, currency: "USD" }, CHILD: { amount: 120, currency: "USD" } },
    segments: [
      { origin: "pzu", destination: "jed", departureAt: future(48), arrivalAt: future(50), carrier: "tq", flightNumber: "tq101" },
    ],
    ...overrides,
  };
}

// A mock provider over real HTTP: each test decides how it answers.
let handler = () => ({ status: 200, body: {} });
const received = [];
const server = http.createServer((req, res) => {
  let data = "";
  req.on("data", (chunk) => (data += chunk));
  req.on("end", async () => {
    received.push({ path: req.url, auth: req.headers.authorization, body: data ? JSON.parse(data) : null });
    const reply = await handler(req.url, data ? JSON.parse(data) : null);
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    if (res.destroyed) return;
    res.writeHead(reply.status, { "content-type": "application/json", ...(reply.headers || {}) });
    res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body));
  });
});
let baseUrl;

function mockEnv(extra = {}) {
  return {
    FLIGHT_PROVIDER_TARCO_URL: baseUrl,
    FLIGHT_PROVIDER_TARCO_TOKEN: SECRET_TOKEN,
    FLIGHT_PROVIDER_TARCO_ENV: "production",
    FLIGHT_PROVIDER_TARCO_LIVE_APPROVED: "yes",
    FLIGHT_PROVIDER_TARCO_TIMEOUT_MS: "300",
    ...extra,
  };
}

// The adapter shape a real provider adapter must implement, here backed by
// the mock provider through the shared HTTP client.
function mockAdapter(env) {
  const config = providerConfig("TARCO", env);
  return {
    async reprice(offer) {
      return providerRequest(config, "/reprice", { offerId: offer.offerId });
    },
    async createPnr(offer, passengers) {
      return providerRequest(config, "/pnr", { offerId: offer.offerId, passengers });
    },
  };
}

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
afterEach(() => {
  unregisterProviderAdapter("TARCO");
  handler = () => ({ status: 200, body: {} });
  received.length = 0;
});

describe("provider registry — request-only unless fully approved", () => {
  test("every real provider is REQUEST_ONLY: no verified integration exists, even with credentials set", () => {
    const env = Object.fromEntries(
      PROVIDERS.flatMap((p) => [
        [`FLIGHT_PROVIDER_${p.code}_URL`, "https://provider.invalid"],
        [`FLIGHT_PROVIDER_${p.code}_TOKEN`, SECRET_TOKEN],
        [`FLIGHT_PROVIDER_${p.code}_ENV`, "production"],
        [`FLIGHT_PROVIDER_${p.code}_LIVE_APPROVED`, "yes"],
      ])
    );
    const statuses = listProviderStatuses(env);
    assert.deepEqual(statuses.map((s) => s.code), ["TARCO", "BADR", "SUDAN_AIRWAYS", "NDC"]);
    for (const status of statuses) {
      assert.equal(status.mode, "REQUEST_ONLY");
      assert.equal(status.reason, "NO_VERIFIED_INTEGRATION");
    }
  });

  test("an adapter alone is not enough: credentials, production and the owner's approval are each required", () => {
    registerProviderAdapter("TARCO", mockAdapter(mockEnv()));
    assert.equal(providerStatus("TARCO", {}).reason, "NO_CREDENTIALS");
    assert.equal(providerStatus("TARCO", mockEnv({ FLIGHT_PROVIDER_TARCO_ENV: "sandbox" })).mode, "SANDBOX");
    assert.equal(providerStatus("TARCO", mockEnv({ FLIGHT_PROVIDER_TARCO_LIVE_APPROVED: "" })).reason, "LIVE_NOT_APPROVED");
    assert.equal(providerStatus("TARCO", mockEnv({ FLIGHT_PROVIDER_TARCO_LIVE_APPROVED: "true" })).reason, "LIVE_NOT_APPROVED");
    assert.equal(providerStatus("TARCO", mockEnv()).mode, "LIVE");
  });

  test("the admin status endpoint never returns URLs or credentials, and is admin-only", async () => {
    const previous = { url: process.env.FLIGHT_PROVIDER_BADR_URL, token: process.env.FLIGHT_PROVIDER_BADR_TOKEN };
    process.env.FLIGHT_PROVIDER_BADR_URL = "https://badr.provider.invalid/api";
    process.env.FLIGHT_PROVIDER_BADR_TOKEN = SECRET_TOKEN;
    try {
      const admin = await loginAsSuperAdmin();
      const res = await admin.get("/api/flight-providers/status");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 4);
      const text = JSON.stringify(res.body);
      assert.ok(!text.includes(SECRET_TOKEN) && !text.includes("badr.provider.invalid"));
      assert.equal(res.body.data.find((s) => s.code === "BADR").credentials, true);
      assert.ok(res.body.data.every((s) => s.mode === "REQUEST_ONLY"));

      assert.equal((await request(app).get("/api/flight-providers/status")).status, 401);
      const email = `providers-employee-${uniqueSuffix()}@nasaem-platform.local`;
      await admin.post("/api/users").send({ fullName: "Providers RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
      const employee = request.agent(app);
      await employee.post("/api/auth/login").send({ email, password: "TestPass@12345" });
      assert.equal((await employee.get("/api/flight-providers/status")).status, 403);
    } finally {
      if (previous.url === undefined) delete process.env.FLIGHT_PROVIDER_BADR_URL; else process.env.FLIGHT_PROVIDER_BADR_URL = previous.url;
      if (previous.token === undefined) delete process.env.FLIGHT_PROVIDER_BADR_TOKEN; else process.env.FLIGHT_PROVIDER_BADR_TOKEN = previous.token;
    }
  });
});

describe("offer normalization — nothing assumed", () => {
  test("normalizes codes, cabin, stops, baggage and only the passenger prices the provider gave", () => {
    const offer = normalizeProviderOffer(rawOffer(), { providerCode: "TARCO" });
    assert.equal(offer.origin, "PZU");
    assert.equal(offer.destination, "JED");
    assert.equal(offer.currency, "USD");
    assert.equal(offer.cabin, "ECONOMY");
    assert.equal(offer.stops, 0);
    assert.deepEqual(offer.baggage, { pieces: 1, weightKg: 23 });
    assert.deepEqual(offer.passengerPrices, { ADULT: 300, CHILD: 120 });
    assert.equal(offer.passengerPrices.INFANT, undefined, "an infant price is never derived");
  });

  test("two connecting segments count one stop; a broken connection is rejected", () => {
    const segments = [
      { origin: "PZU", destination: "CAI", departureAt: future(48), arrivalAt: future(50), carrier: "SD", flightNumber: "SD1" },
      { origin: "CAI", destination: "JED", departureAt: future(52), arrivalAt: future(54), carrier: "SD", flightNumber: "SD2" },
    ];
    assert.equal(normalizeProviderOffer(rawOffer({ segments }), { providerCode: "SUDAN_AIRWAYS" }).stops, 1);
    const broken = [segments[0], { ...segments[1], origin: "ADD" }];
    assert.equal(normalizeProviderOffer(rawOffer({ segments: broken }), { providerCode: "SUDAN_AIRWAYS" }), null);
    const overlapping = [segments[0], { ...segments[1], departureAt: future(49) }];
    assert.equal(normalizeProviderOffer(rawOffer({ segments: overlapping }), { providerCode: "SUDAN_AIRWAYS" }), null);
  });

  test("an offer without currency, price, validity, or already expired is not an offer", () => {
    for (const overrides of [{ currency: "" }, { currency: "dollars" }, { total: 0 }, { validUntil: null }, { validUntil: future(-1) }, { segments: [] }]) {
      assert.equal(normalizeProviderOffer(rawOffer(overrides), { providerCode: "TARCO" }), null, JSON.stringify(overrides));
    }
  });

  test("a passenger price in another currency is dropped, not converted", () => {
    const offer = normalizeProviderOffer(rawOffer({ passengerPrices: { ADULT: { amount: 300, currency: "SDG" } } }), { providerCode: "TARCO" });
    assert.equal(offer.passengerPrices, null);
  });
});

describe("provider HTTP client — timeouts, rate limits and no leaks", () => {
  const config = () => providerConfig("TARCO", mockEnv());

  test("a slow provider times out", async () => {
    handler = () => ({ status: 200, body: {}, delayMs: 1_000 });
    await assert.rejects(providerRequest(config(), "/search", {}), { code: "PROVIDER_TIMEOUT" });
  });

  test("429 becomes RATE_LIMITED with the provider's Retry-After", async () => {
    handler = () => ({ status: 429, headers: { "retry-after": "30" }, body: {} });
    await assert.rejects(providerRequest(config(), "/search", {}), (error) => error.code === "PROVIDER_RATE_LIMITED" && error.retryAfterSeconds === 30);
  });

  test("auth, server and malformed replies map to codes; the error never carries the body, token or passengers", async () => {
    for (const [reply, code] of [
      [{ status: 401, body: { echo: SECRET_TOKEN } }, "PROVIDER_AUTH_FAILED"],
      [{ status: 503, body: { echo: PASSENGER } }, "PROVIDER_UNAVAILABLE"],
      [{ status: 200, body: "not json" }, "PROVIDER_BAD_RESPONSE"],
    ]) {
      handler = () => reply;
      await assert.rejects(providerRequest(config(), "/pnr", { passengers: [PASSENGER] }), (error) => {
        const text = `${error.message} ${JSON.stringify(error)}`;
        return error.code === code && !text.includes(SECRET_TOKEN) && !text.includes(PASSENGER.passportNo);
      });
    }
  });

  test("an unreachable provider is UNAVAILABLE", async () => {
    await assert.rejects(providerRequest({ url: "http://127.0.0.1:1", token: "x", timeoutMs: 500 }, "/search", {}), { code: "PROVIDER_UNAVAILABLE" });
  });
});

describe("booking gate — reprice, then PNR only on provider success", () => {
  const admin = { id: "u1", role: "ADMIN" };
  const offer = () => normalizeProviderOffer(rawOffer(), { providerCode: "TARCO" });

  test("a provider that is not LIVE stays a manual request; nothing is sent", async () => {
    const result = await confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: admin, env: mockEnv() });
    assert.deepEqual(result, { outcome: "REQUEST_ONLY", reason: "NO_VERIFIED_INTEGRATION" });
    assert.equal(received.length, 0);
  });

  test("only an admin can confirm, and an expired fare is refused before calling the provider", async () => {
    const env = mockEnv();
    registerProviderAdapter("TARCO", mockAdapter(env));
    await assert.rejects(confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: { role: "EMPLOYEE" }, env }), { code: "FORBIDDEN" });
    const later = new Date(Date.now() + 2 * 3_600_000);
    await assert.rejects(confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: admin, env, now: later }), { code: "FARE_EXPIRED" });
    assert.equal(received.length, 0);
  });

  test("a changed price stops before any PNR and reports the new total", async () => {
    const env = mockEnv();
    registerProviderAdapter("TARCO", mockAdapter(env));
    handler = (path) => (path === "/reprice" ? { status: 200, body: { available: true, total: 455, currency: "USD" } } : { status: 200, body: { pnr: "ABC123" } });
    await assert.rejects(
      confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: admin, env }),
      (error) => error.code === "PRICE_CHANGED" && error.newPrice.total === 455
    );
    assert.deepEqual(received.map((r) => r.path), ["/reprice"]);
  });

  test("an unavailable fare and a missing PNR are both failures", async () => {
    const env = mockEnv();
    registerProviderAdapter("TARCO", mockAdapter(env));
    handler = () => ({ status: 200, body: { available: false } });
    await assert.rejects(confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: admin, env }), { code: "FARE_UNAVAILABLE" });
    handler = (path) => (path === "/reprice" ? { status: 200, body: { available: true, total: 420, currency: "USD" } } : { status: 200, body: { pnr: "" } });
    await assert.rejects(confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: admin, env }), { code: "PNR_FAILED" });
  });

  test("a live, approved provider with an unchanged price returns its PNR", async () => {
    const env = mockEnv();
    registerProviderAdapter("TARCO", mockAdapter(env));
    handler = (path) => (path === "/reprice" ? { status: 200, body: { available: true, total: 420, currency: "USD" } } : { status: 200, body: { pnr: "abc123" } });
    const result = await confirmProviderBooking({ offer: offer(), passengers: [PASSENGER], actor: admin, env });
    assert.deepEqual(result, { outcome: "PNR_CREATED", pnr: "ABC123", provider: "TARCO", total: 420, currency: "USD" });
    assert.ok(received.every((r) => r.auth === `Bearer ${SECRET_TOKEN}`));
  });
});
