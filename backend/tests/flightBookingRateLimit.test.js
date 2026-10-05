import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, loginAsSuperAdmin, request, uniqueSuffix } from "./helpers/api.js";

// Default (production) limits: creation 10 / 15 min / IP, bad-token guesses
// 20 / 15 min / IP (successful requests are not counted, so the customer page
// can keep polling).
describe("flight booking abuse protection (default limits)", () => {
  let flightId;

  before(async () => {
    const admin = await loginAsSuperAdmin();
    const flight = await admin.post("/api/flights").send({
      airline: "TARCO", flightNumber: `3R${uniqueSuffix().slice(-4)}`, originCode: "PZU", originName: "Port Sudan",
      destinationCode: "JED", destinationName: "Jeddah", departureAt: "2026-12-02T08:30:00+02:00",
      arrivalAt: "2026-12-02T11:30:00+02:00", stops: 0, price: 1000, currency: "SDG", availableSeats: 50,
    });
    flightId = flight.body.data.id;
  });

  const create = () =>
    request(app).post("/api/flight-bookings").send({
      flightIds: [flightId],
      amount: 1000,
      currency: "SDG",
      contact: { fullName: "Rate Test", phone: `2499${uniqueSuffix().slice(-8)}` },
      passengers: [{ firstName: "A", lastName: "B", passportNo: `RL${uniqueSuffix()}`, nationality: "Sudan" }],
    });

  test("bad-token guessing is rate limited", async () => {
    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      statuses.push((await request(app).get("/api/flight-bookings/public/FLT-DOESNOTEXIST").set("X-Booking-Token", `guess-${i}`)).status);
    }
    assert.ok(statuses.includes(429), `expected throttling within 30 bad guesses, got ${[...new Set(statuses)].join(",")}`);
  });

  test("booking creation is rate limited per IP", async () => {
    const statuses = [];
    for (let i = 0; i < 14; i += 1) statuses.push((await create()).status);
    assert.ok(statuses.includes(429), `expected throttling, got ${[...new Set(statuses)].join(",")}`);
    assert.ok(statuses.slice(0, 5).every((s) => s === 201), "the first few legitimate bookings must succeed");
  });
});
