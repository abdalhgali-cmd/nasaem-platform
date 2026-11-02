// AUDIT-00 P0 G-01: a website flight booking is priced on the server for
// every seated passenger. Kept apart from flightBookingIntegrity.test.js and
// flightBookingInventory.test.js: each file is its own process, so the
// public booking rate limit (20 per 15 minutes per client) holds per file.
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

describe("flight booking total covers every seated passenger (AUDIT-00 G-01)", () => {
  const BIRTH = { ADULT: "1990-01-01", CHILD: "2018-05-01", INFANT: "2026-06-01" };
  const pax = (passengerType, n = 1, birthDate = BIRTH[passengerType] || "1990-01-01") => Array.from({ length: n }, () => ({ firstName: "SYN", lastName: "PAX", nationality: "SD", birthDate, passportNo: `SP${uniqueSuffix()}`, passengerType }));

  test("two adults and a child pay three seats; the order carries the same total", async () => {
    const { res: perPerson } = await book({ amount: PRICE, passengers: [...pax("ADULT", 2), ...pax("CHILD")] });
    assert.equal(perPerson.status, 409);
    assert.equal(perPerson.body.code, "PRICE_CHANGED");

    const { res } = await book({ amount: PRICE * 3, passengers: [...pax("ADULT", 2), ...pax("CHILD")] });
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.booking.amount), PRICE * 3);
    const order = (await prisma.$queryRawUnsafe(`SELECT o."totalAmount" AS total FROM flight_bookings fb JOIN "Order" o ON o.id=fb.order_id WHERE fb.id=$1`, res.body.booking.id))[0];
    assert.equal(Number(order.total), PRICE * 3);
  });

  test("each segment is charged per seated passenger", async () => {
    const second = await staffClient(admin).post("/api/flights").send({
      airline: "SynthAir", flightNumber: `SY${uniqueSuffix().slice(-4)}`, originCode: "JED", originName: "Jeddah",
      destinationCode: "PZU", destinationName: "Port Sudan", departureAt: "2027-01-20T08:00:00+02:00", arrivalAt: "2027-01-20T10:00:00+02:00",
      price: 500000, currency: "SDG", availableSeats: 9,
    });
    const { res } = await book({ flightId: undefined, flightIds: [flightId, second.body.data.id], passengers: pax("ADULT", 2) });
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.booking.amount), (PRICE + 500000) * 2);
  });

  test("a booking with an infant is not priced online", async () => {
    const { res } = await book({ passengers: [...pax("ADULT"), ...pax("INFANT")] });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "INFANT_REQUIRES_QUOTE");
  });

  test("the birth date decides the category: an infant labelled adult is still quoted by staff", async () => {
    const { res: hidden } = await book({ passengers: [...pax("ADULT"), ...pax("ADULT", 1, "2026-06-01")] });
    assert.equal(hidden.status, 409);
    assert.equal(hidden.body.code, "INFANT_REQUIRES_QUOTE");
    assert.equal((await book({ passengers: [...pax("ADULT"), ...pax("ADULT", 1, "2018-05-01")] })).res.body.code, "PASSENGER_AGE_MISMATCH");
    assert.equal((await book({ passengers: [...pax("ADULT"), ...pax("CHILD", 1, "1990-01-01")] })).res.body.code, "PASSENGER_AGE_MISMATCH");
    for (const bad of ["not-a-date", "2015-02-30", "1990-01-01garbage"]) {
      assert.equal((await book({ passengers: pax("ADULT", 1, bad) })).res.body.code, "INVALID_BIRTH_DATE", bad);
    }
    assert.equal((await book({ passengers: [{ ...pax("ADULT")[0], birthDate: undefined }] })).res.status, 400);
  });

  test("age boundaries use the departure's calendar day (flight departs 2027-01-10 06:00 UTC)", async () => {
    // Turns 12 on the travel date: an adult. Turns 12 the next day: still a child.
    assert.equal((await book({ passengers: pax("ADULT", 1, "2015-01-10") })).res.status, 201);
    assert.equal((await book({ passengers: [...pax("ADULT"), ...pax("CHILD", 1, "2015-01-11")] })).res.status, 201);
    // Turns 2 on the travel date: a child, priced online. One day younger: an infant.
    assert.equal((await book({ passengers: [...pax("ADULT"), ...pax("CHILD", 1, "2025-01-10")] })).res.status, 201);
    assert.equal((await book({ passengers: [...pax("ADULT"), ...pax("CHILD", 1, "2025-01-11")] })).res.body.code, "INFANT_REQUIRES_QUOTE");
  });

  test("an unknown passenger type and a booking with no adult are refused", async () => {
    assert.equal((await book({ passengers: pax("SENIOR") })).res.body.code, "INVALID_PASSENGER_TYPE");
    assert.equal((await book({ passengers: pax("CHILD") })).res.body.code, "ADULT_REQUIRED");
  });
});
