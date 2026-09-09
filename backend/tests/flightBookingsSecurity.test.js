import "./env.js";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "../src/config/database.js";
import { app, request, loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

// flight_inventory is a raw-SQL table with no Prisma model — see
// flightSearch.test.js for the same cleanup pattern.
const createdFlightIds = [];
const createdCustomerIds = [];
const createdBookingIds = [];

function futureDateString(daysAhead) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function createSdgFlight(agent, price) {
  const suffix = uniqueSuffix();
  const date = futureDateString(15);
  const res = await agent.post("/api/flights").send({
    airline: "TARCO",
    flightNumber: `3T${suffix.slice(-3)}`,
    originCode: "PZU",
    originName: "Port Sudan",
    destinationCode: "JED",
    destinationName: "Jeddah",
    departureAt: `${date}T08:00:00+02:00`,
    arrivalAt: `${date}T11:00:00+02:00`,
    price,
    currency: "SDG",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  createdFlightIds.push(res.body.data.id);
  return res.body.data.id;
}

function passenger(overrides = {}) {
  return {
    firstName: "Test",
    lastName: "Passenger",
    nationality: "SD",
    passportNo: `P-${uniqueSuffix()}`,
    ...overrides,
  };
}

describe("flight bookings — public endpoint trust boundary", () => {
  let agent;

  before(async () => {
    agent = await loginAsSuperAdmin();
  });

  after(async () => {
    if (createdBookingIds.length) {
      await prisma.$executeRawUnsafe(`DELETE FROM flight_bookings WHERE id = ANY($1::text[])`, createdBookingIds);
    }
    for (const id of createdCustomerIds) {
      await prisma.order.deleteMany({ where: { customerId: id } }).catch(() => {});
      await prisma.customer.delete({ where: { id } }).catch(() => {});
    }
    if (createdFlightIds.length) {
      await prisma.$executeRawUnsafe(`DELETE FROM flight_inventory WHERE id = ANY($1::text[])`, createdFlightIds);
    }
  });

  test("rejects a booking whose client-supplied amount is below the real flight price", async () => {
    const flightId = await createSdgFlight(agent, 1000);

    const res = await request(app)
      .post("/api/flight-bookings")
      .send({
        flightIds: [flightId],
        amount: 1, // attacker-supplied, real price is 1000 SDG
        currency: "SDG",
        passengers: [passenger()],
        contact: { fullName: "Attacker", phone: `24990${uniqueSuffix()}` },
      });

    assert.equal(res.status, 400, JSON.stringify(res.body));
  });

  test("accepts a booking whose amount matches server-computed flight_inventory pricing, and stores the verified amount", async () => {
    const flightId = await createSdgFlight(agent, 750);

    const res = await request(app)
      .post("/api/flight-bookings")
      .send({
        flightIds: [flightId],
        amount: 750,
        currency: "SDG",
        passengers: [passenger()],
        contact: { fullName: "Real Customer", phone: `24991${uniqueSuffix()}` },
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(Number(res.body.booking.amount), 750);
    createdBookingIds.push(res.body.booking.id);
    createdCustomerIds.push(res.body.booking.customer_id);
  });

  test("ignores a client-supplied customerId and never attaches the order to that account", async () => {
    const flightId = await createSdgFlight(agent, 500);
    const victimSuffix = uniqueSuffix();
    const victim = await prisma.customer.create({
      data: {
        customerNo: `CUS-VICTIM-${victimSuffix}`,
        fullName: "Victim Customer",
        phone: `24992${victimSuffix}`,
        passportNo: `VICTIM-${victimSuffix}`,
      },
    });
    createdCustomerIds.push(victim.id);

    const res = await request(app)
      .post("/api/flight-bookings")
      .send({
        customerId: victim.id, // attacker-supplied, must be ignored
        flightIds: [flightId],
        amount: 500,
        currency: "SDG",
        passengers: [passenger()],
        contact: { fullName: "Attacker", phone: `24993${uniqueSuffix()}` },
      });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.notEqual(res.body.booking.customer_id, victim.id, "the attacker-chosen customerId must never be honored");
    createdBookingIds.push(res.body.booking.id);
    createdCustomerIds.push(res.body.booking.customer_id);

    const victimOrders = await prisma.order.count({ where: { customerId: victim.id } });
    assert.equal(victimOrders, 0, "the victim's account must gain no order from this request");
  });

  test("only reuses an existing customer by passport number when the submitted phone also matches", async () => {
    const flightId = await createSdgFlight(agent, 600);
    const ownerSuffix = uniqueSuffix();
    const owner = await prisma.customer.create({
      data: {
        customerNo: `CUS-OWNER-${ownerSuffix}`,
        fullName: "Real Passport Owner",
        phone: `24994${ownerSuffix}`,
        passportNo: `SHARED-${ownerSuffix}`,
      },
    });
    createdCustomerIds.push(owner.id);

    // Attacker knows/guesses the owner's passport number but not their phone.
    const mismatched = await request(app)
      .post("/api/flight-bookings")
      .send({
        flightIds: [flightId],
        amount: 600,
        currency: "SDG",
        passengers: [passenger({ passportNo: owner.passportNo })],
        contact: { fullName: "Attacker", phone: `24995${uniqueSuffix()}` },
      });
    assert.equal(mismatched.status, 201, JSON.stringify(mismatched.body));
    assert.notEqual(mismatched.body.booking.customer_id, owner.id, "a passport match without a phone match must not reuse the real owner's account");
    createdBookingIds.push(mismatched.body.booking.id);
    createdCustomerIds.push(mismatched.body.booking.customer_id);

    // The genuine owner, submitting their own phone alongside the same passport, is deduped onto their own record.
    const flightId2 = await createSdgFlight(agent, 600);
    const genuine = await request(app)
      .post("/api/flight-bookings")
      .send({
        flightIds: [flightId2],
        amount: 600,
        currency: "SDG",
        passengers: [passenger({ passportNo: owner.passportNo })],
        contact: { fullName: owner.fullName, phone: owner.phone },
      });
    assert.equal(genuine.status, 201, JSON.stringify(genuine.body));
    assert.equal(genuine.body.booking.customer_id, owner.id, "the real owner (matching phone) should be deduped onto their existing record");
    createdBookingIds.push(genuine.body.booking.id);
  });

  test("rejects an inactive/unknown flight id instead of trusting the submitted amount", async () => {
    const res = await request(app)
      .post("/api/flight-bookings")
      .send({
        flightIds: ["does-not-exist"],
        amount: 100,
        currency: "SDG",
        passengers: [passenger()],
        contact: { fullName: "Attacker", phone: `24996${uniqueSuffix()}` },
      });

    assert.equal(res.status, 400, JSON.stringify(res.body));
  });
});
