// AUDIT-00 P0 G-02: only the agency's own bookable inventory can be booked
// (no provider result, no sold-out or departed flight). Its own file for the
// public booking rate limit (see flightBookingPricing.test.js).
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

let admin;
let flightId;
const PRICE = 750000;

before(async () => {
  admin = await createStaffUser({ role: "ADMIN" });
  const flight = await staffClient(admin).post("/api/flights").send({
    airline: "SynthAir", flightNumber: `SY${uniqueSuffix().slice(-4)}`, originCode: "PZU", originName: "Port Sudan",
    destinationCode: "JED", destinationName: "Jeddah", departureAt: "2027-01-10T08:00:00+02:00", arrivalAt: "2027-01-10T10:00:00+02:00",
    price: PRICE, currency: "SDG", availableSeats: 9,
  });
  assert.equal(flight.status, 201);
  flightId = flight.body.data.id;
});

function book(overrides = {}) {
  const phone = `2499${uniqueSuffix().slice(-8)}`;
  return request(app).post("/api/flight-bookings").send({
    flightId,
    currency: "SDG",
    contact: { fullName: "Synthetic Traveler", phone },
    passengers: [{ firstName: "SYN", lastName: "TRAVELER", nationality: "SD", birthDate: "1990-01-01", passportNo: `SP${uniqueSuffix()}` }],
    ...overrides,
  }).then((res) => ({ res, phone }));
}

describe("only bookable inventory can be booked (AUDIT-00 G-02)", () => {
  async function inventoryFlight(patch) {
    const res = await staffClient(admin).post("/api/flights").send({
      airline: "SynthAir", flightNumber: `SY${uniqueSuffix().slice(-4)}`, originCode: "PZU", originName: "Port Sudan",
      destinationCode: "JED", destinationName: "Jeddah", departureAt: "2027-02-10T08:00:00+02:00", arrivalAt: "2027-02-10T10:00:00+02:00",
      price: PRICE, currency: "SDG", availableSeats: 9, ...patch,
    });
    assert.equal(res.status, 201);
    return res.body.data.id;
  }
  const countBookings = async () => (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM flight_bookings`))[0].n;

  test("a provider (Trip.com) result cannot create a booking", async () => {
    const before = await countBookings();
    const { res } = await book({ flightId: "TRIP:abc123" });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "FLIGHT_NOT_BOOKABLE");
    assert.equal(await countBookings(), before);
  });

  test("not enough seats → 409; seats are checked against seated passengers", async () => {
    const id = await inventoryFlight({ availableSeats: 1 });
    const two = [1, 2].map(() => ({ firstName: "SYN", lastName: "PAX", nationality: "SD", birthDate: "1990-01-01", passportNo: `SP${uniqueSuffix()}` }));
    const { res: soldOut } = await book({ flightId: id, passengers: two });
    assert.equal(soldOut.status, 409);
    assert.equal(soldOut.body.code, "FLIGHT_SOLD_OUT");
    assert.equal((await book({ flightId: id })).res.status, 201);
    const zero = await inventoryFlight({ availableSeats: 0 });
    assert.equal((await book({ flightId: zero })).res.body.code, "FLIGHT_SOLD_OUT");
  });

  test("a departed flight cannot be booked", async () => {
    const id = await inventoryFlight({ departureAt: "2020-01-10T08:00:00+02:00", arrivalAt: "2020-01-10T10:00:00+02:00" });
    const { res } = await book({ flightId: id });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "FLIGHT_DEPARTED");
  });
});
