import "./env.js";
import http from "node:http";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";
import { clearTripSearchCache } from "../src/modules/flights/flights.cache.js";

function futureDateString(daysAhead) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// flight_inventory is a raw-SQL table with no Prisma model, so nothing
// deletes these rows automatically. flightFxRefresh.test.js's own
// assertion depends on a LIMIT-100, departure_at-ordered query — enough
// accumulated manual flights with earlier dates than its fixed
// 2026-09-20 fixture can silently push its own row past that limit. This
// file is the one creating those earlier-dated flights, so it cleans up
// after itself.
const createdFlightIds = [];

describe("flight search (Platform 3.0 Phase 12)", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  after(async () => {
    if (createdFlightIds.length === 0) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM flight_inventory WHERE id = ANY($1::text[])`,
      createdFlightIds
    );
  });

  test("public search endpoint requires no authentication and requires from/to/departureDate", async () => {
    const missing = await request(app).get("/api/flights/search");
    assert.equal(missing.status, 400);

    const res = await request(app).get(`/api/flights/search?from=PZU&to=JED&date=${futureDateString(10)}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.legs));
  });

  test("clearly reports the Trip.com integration as not configured, rather than inventing flights (no TRIP_API_URL in this environment)", async () => {
    const res = await request(app).get(`/api/flights/search?from=PZU&to=JED&date=${futureDateString(10)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.tripConfigured, false, "TRIP_API_URL is intentionally unset in this environment — no real credentials to invent a test against");
    assert.deepEqual(res.body.legs[0].trip, []);
  });

  test("only a Sudanese-airline manual flight matches (pre-existing flights.service.js filter, unmodified here)", async () => {
    const suffix = uniqueSuffix();
    const date = futureDateString(20);
    const sudaneseFlight = await agent.post("/api/flights").send({
      airline: "TARCO",
      flightNumber: `3T${suffix.slice(-3)}`,
      originCode: "PZU",
      originName: "Port Sudan",
      destinationCode: "JED",
      destinationName: "Jeddah",
      departureAt: `${date}T08:00:00+02:00`,
      arrivalAt: `${date}T11:00:00+02:00`,
      price: 500,
      currency: "USD",
    });
    assert.equal(sudaneseFlight.status, 201, JSON.stringify(sudaneseFlight.body));
    createdFlightIds.push(sudaneseFlight.body.data.id);

    const nonSudaneseFlight = await agent.post("/api/flights").send({
      airline: `Other Airline ${suffix}`,
      flightNumber: `OA${suffix.slice(-3)}`,
      originCode: "PZU",
      originName: "Port Sudan",
      destinationCode: "JED",
      destinationName: "Jeddah",
      departureAt: `${date}T09:00:00+02:00`,
      arrivalAt: `${date}T12:00:00+02:00`,
      price: 500,
      currency: "USD",
    });
    assert.equal(nonSudaneseFlight.status, 201);
    createdFlightIds.push(nonSudaneseFlight.body.data.id);

    const res = await request(app).get(`/api/flights/search?from=PZU&to=JED&date=${date}`);
    const manualAirlines = res.body.legs[0].manual.map((f) => f.airline);
    assert.ok(manualAirlines.includes("TARCO"), "expected the Sudanese-airline flight to appear");
    assert.ok(!manualAirlines.includes(`Other Airline ${suffix}`), "expected the non-Sudanese-airline flight to still be filtered out");
  });

  test("attaches the matching Airline directory's logo to a search result (Phase 10 reuse)", async () => {
    const suffix = uniqueSuffix();
    const date = futureDateString(25);

    const airlineRes = await agent.post("/api/airlines").send({ name: `BADR ${suffix}`, active: true });
    const airlineId = airlineRes.body.data.id;
    await agent
      .post(`/api/airlines/${airlineId}/logo`)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "logo.png", contentType: "image/png" });

    // "BADR" is one of the hardcoded SUDANESE_AIRLINES entries, so a
    // flight whose airline name contains it passes the existing filter.
    const flightRes = await agent.post("/api/flights").send({
      airline: `BADR ${suffix}`,
      flightNumber: `BR${suffix.slice(-3)}`,
      originCode: "PZU",
      originName: "Port Sudan",
      destinationCode: "JED",
      destinationName: "Jeddah",
      departureAt: `${date}T08:00:00+02:00`,
      arrivalAt: `${date}T11:00:00+02:00`,
      price: 500,
      currency: "USD",
    });
    createdFlightIds.push(flightRes.body.data.id);

    const res = await request(app).get(`/api/flights/search?from=PZU&to=JED&date=${date}`);
    const flight = res.body.legs[0].manual.find((f) => f.airline === `BADR ${suffix}`);
    assert.ok(flight, "expected the seeded flight in the search results");
    assert.equal(flight.airlineLogoKey, `airline-${airlineId}`);
  });

  test("a flight for an airline with no configured logo has airlineLogoKey: null (never invents one)", async () => {
    const suffix = uniqueSuffix();
    const date = futureDateString(27);
    const flightRes = await agent.post("/api/flights").send({
      airline: `SUDANAIR ${suffix}`,
      flightNumber: `SD${suffix.slice(-3)}`,
      originCode: "PZU",
      originName: "Port Sudan",
      destinationCode: "JED",
      destinationName: "Jeddah",
      departureAt: `${date}T08:00:00+02:00`,
      arrivalAt: `${date}T11:00:00+02:00`,
      price: 500,
      currency: "USD",
    });
    createdFlightIds.push(flightRes.body.data.id);

    const res = await request(app).get(`/api/flights/search?from=PZU&to=JED&date=${date}`);
    const flight = res.body.legs[0].manual.find((f) => f.airline === `SUDANAIR ${suffix}`);
    assert.ok(flight);
    assert.equal(flight.airlineLogoKey, null);
  });
});

// Exercises flights.cache.js's caching wrapper against a real local HTTP
// server standing in for a configured Trip.com endpoint — proves an
// identical repeated search only hits the provider once within the cache
// window, without claiming anything about the real Trip.com integration
// (which has no credentials in this environment — see the test above).
describe("Trip.com search result caching (Platform 3.0 Phase 12)", () => {
  let server;
  let callCount = 0;
  let originalTripApiUrl;

  before(async () => {
    callCount = 0;
    server = http.createServer((req, res) => {
      callCount += 1;
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ legs: [[{ id: "T1", airline: "Test Provider Air", flightNumber: "TP1", price: 100, currency: "USD" }]] }));
      });
    });
    await new Promise((resolve) => server.listen(0, resolve));
    originalTripApiUrl = process.env.TRIP_API_URL;
    process.env.TRIP_API_URL = `http://127.0.0.1:${server.address().port}`;
    clearTripSearchCache();
  });

  after(async () => {
    process.env.TRIP_API_URL = originalTripApiUrl;
    await new Promise((resolve) => server.close(resolve));
  });

  test("an identical repeated search only calls the provider once (cache hit)", async () => {
    const date = futureDateString(15);
    const url = `/api/flights/search?from=PZU&to=JED&date=${date}`;

    const first = await request(app).get(url);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.tripConfigured, true);
    assert.equal(callCount, 1);

    const second = await request(app).get(url);
    assert.equal(second.status, 200);
    assert.equal(callCount, 1, "expected the second identical search to be served from cache, not a second provider call");
    assert.deepEqual(second.body.legs, first.body.legs);
  });

  test("a different search (different date) still reaches the provider", async () => {
    const otherDate = futureDateString(16);
    const res = await request(app).get(`/api/flights/search?from=PZU&to=JED&date=${otherDate}`);
    assert.equal(res.status, 200);
    assert.equal(callCount, 2);
  });
});
