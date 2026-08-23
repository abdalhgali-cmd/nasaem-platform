import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// IATA/ICAO codes are fixed-length (3/4 chars), so unlike most fixtures
// in this suite there's no room for a per-run unique suffix embedded in
// the code — clean up this file's own fixed test codes first (same
// reasoning as airlines.test.js).
const TEST_IATA_CODES = ["JED", "TXX"];
const TEST_ICAO_CODES = ["OEJN", "OTXX"];

describe("global airport directory (Platform 3.0 Phase 11)", () => {
  let agent;
  let jeddahAirportId;

  before(async () => {
    agent = await loginAsSuperAdmin();
    await prisma.airport.deleteMany({ where: { iataCode: { in: TEST_IATA_CODES } } });
    await prisma.airport.deleteMany({ where: { icaoCode: { in: TEST_ICAO_CODES } } });

    const res = await agent.post("/api/airports").send({
      nameAr: "مطار الملك عبدالعزيز الدولي",
      nameEn: "King Abdulaziz International Airport",
      cityAr: "جدة",
      cityEn: "Jeddah",
      countryAr: "السعودية",
      countryEn: "Saudi Arabia",
      iataCode: "jed",
      icaoCode: "oejn",
      latitude: 21.6796,
      longitude: 39.1565,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    jeddahAirportId = res.body.data.id;
  });

  test("requires authentication for admin CRUD (not the search endpoint)", async () => {
    const listRes = await request(app).get("/api/airports");
    assert.equal(listRes.status, 401);
    const createRes = await request(app).post("/api/airports").send({ nameAr: "x", cityAr: "x", countryAr: "x" });
    assert.equal(createRes.status, 401);
  });

  test("normalizes IATA/ICAO codes to uppercase", async () => {
    const airport = await agent.get("/api/airports").then((r) => r.body.data.find((a) => a.id === jeddahAirportId));
    assert.equal(airport.iataCode, "JED");
    assert.equal(airport.icaoCode, "OEJN");
  });

  // The plan's own examples: جدة, Jeddah, King Abdulaziz, JED, OEJN must
  // all find the same airport.
  for (const query of ["جدة", "Jeddah", "King Abdulaziz", "JED", "OEJN"]) {
    test(`search "${query}" finds the Jeddah airport`, async () => {
      const res = await request(app).get(`/api/airports/search?q=${encodeURIComponent(query)}`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(
        res.body.data.some((a) => a.id === jeddahAirportId),
        `expected query "${query}" to find the Jeddah airport, got ${JSON.stringify(res.body.data.map((a) => a.nameEn))}`
      );
    });
  }

  test("search requires no authentication", async () => {
    const res = await request(app).get("/api/airports/search?q=Jeddah");
    assert.equal(res.status, 200);
  });

  test("search rejects a missing/empty query", async () => {
    const res = await request(app).get("/api/airports/search?q=");
    assert.equal(res.status, 400);
  });

  test("an inactive airport is excluded from search results", async () => {
    const suffix = uniqueSuffix();
    const createRes = await agent.post("/api/airports").send({
      nameAr: `مطار معطل ${suffix}`,
      nameEn: `Inactive Airport ${suffix}`,
      cityAr: "مدينة",
      countryAr: "دولة",
      active: false,
    });
    assert.equal(createRes.status, 201);

    const searchRes = await request(app).get(`/api/airports/search?q=${encodeURIComponent("Inactive Airport " + suffix)}`);
    assert.ok(!searchRes.body.data.some((a) => a.id === createRes.body.data.id));
  });

  test("rejects a malformed IATA/ICAO code", async () => {
    const badIata = await agent.post("/api/airports").send({ nameAr: "x", cityAr: "x", countryAr: "x", iataCode: "TOOLONG" });
    assert.equal(badIata.status, 400);
    const badIcao = await agent.post("/api/airports").send({ nameAr: "x", cityAr: "x", countryAr: "x", icaoCode: "AB" });
    assert.equal(badIcao.status, 400);
  });

  test("prevents a duplicate IATA code", async () => {
    const res = await agent.post("/api/airports").send({ nameAr: "مطار مكرر", cityAr: "جدة", countryAr: "السعودية", iataCode: "jed" });
    assert.equal(res.status, 409, JSON.stringify(res.body));
  });

  test("paginated admin listing works", async () => {
    const res = await agent.get("/api/airports?page=1&limit=5");
    assert.equal(res.status, 200);
    assert.ok(res.body.meta);
    assert.ok(res.body.data.length <= 5);
  });

  test("404s updating/deleting an airport that doesn't exist", async () => {
    const patchRes = await agent.patch("/api/airports/does-not-exist").send({ nameAr: "x" });
    assert.equal(patchRes.status, 404);
    const deleteRes = await agent.delete("/api/airports/does-not-exist");
    assert.equal(deleteRes.status, 404);
  });

  test("EMPLOYEE cannot create airports but can read them", async () => {
    const suffix = uniqueSuffix();
    const email = `airports-employee-${suffix}@nasaem-platform.local`;
    await agent.post("/api/users").send({ fullName: "Airports RBAC Employee", email, password: "TestPass@12345", role: "EMPLOYEE" });
    const employeeAgent = request.agent(app);
    await employeeAgent.post("/api/auth/login").send({ email, password: "TestPass@12345" });

    const createRes = await employeeAgent.post("/api/airports").send({ nameAr: "x", cityAr: "x", countryAr: "x" });
    assert.equal(createRes.status, 403);
    const listRes = await employeeAgent.get("/api/airports");
    assert.equal(listRes.status, 200);
  });
});
