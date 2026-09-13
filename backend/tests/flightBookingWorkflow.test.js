import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { app, loginAsSuperAdmin, request, uniqueSuffix } from "./helpers/api.js";

describe("flight booking workflow", () => {
  let admin;
  let flightId;
  let booking;
  const phone = `24991${uniqueSuffix().slice(-7)}`;

  before(async () => {
    admin = await loginAsSuperAdmin();
    const flightRes = await admin.post("/api/flights").send({ airline: "TARCO", flightNumber: `3T${uniqueSuffix().slice(-4)}`, originCode: "PZU", originName: "Port Sudan", destinationCode: "JED", destinationName: "Jeddah", departureAt: "2026-09-15T08:30:00+02:00", arrivalAt: "2026-09-15T11:30:00+02:00", stops: 0, baggage: "30 KG", cabin: "Economy", price: 1500000, currency: "SDG", availableSeats: 10 });
    assert.equal(flightRes.status, 201);
    flightId = flightRes.body.data.id;
    const bankRes = await admin.post("/api/flight-bookings/admin/bank-accounts").send({ key: `test-bank-${uniqueSuffix()}`, label: "حساب اختبار الطيران", bankName: "Test Bank", accountNumber: `000${uniqueSuffix()}`, active: true });
    assert.equal(bankRes.status, 201);
  });

  test("runs request -> provisional -> payment receipt -> confirmation -> final ticket", async () => {
    const createRes = await request(app).post("/api/flight-bookings").send({ flightId, amount: 1500000, currency: "SDG", contact: { fullName: "Flight Workflow Test", phone, email: "flight@test.local" }, passengers: [{ firstName: "TEST", lastName: "PASSENGER", birthDate: "1990-01-01", gender: "MALE", nationality: "Sudan", passportNo: `P${uniqueSuffix()}`, passengerType: "ADULT" }] });
    assert.equal(createRes.status, 201);
    booking = createRes.body.booking;
    assert.equal(booking.status, "REQUESTED");

    const provisionalRes = await admin.post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", Buffer.from("provisional ticket"), "provisional.txt");
    assert.equal(provisionalRes.status, 200);
    assert.equal(provisionalRes.body.booking.status, "PAYMENT_PENDING");

    const publicRes = await request(app).get(`/api/flight-bookings/public/${booking.booking_number}`).query({ phone });
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.body.booking.status, "PAYMENT_PENDING");
    assert.ok(publicRes.body.booking.bankAccounts.length > 0);

    const receiptRes = await request(app).post(`/api/flight-bookings/${booking.booking_number}/payment-receipt`).field("phone", phone).attach("file", Buffer.from("payment receipt"), "receipt.txt");
    assert.equal(receiptRes.status, 200);
    assert.equal(receiptRes.body.booking.status, "PAYMENT_UNDER_REVIEW");

    const confirmRes = await admin.post(`/api/flight-bookings/${booking.id}/confirm-payment`).send({ note: "Verified against bank statement" });
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.booking.status, "PAYMENT_CONFIRMED");

    const prematureRes = await admin.post(`/api/flight-bookings/${booking.id}/confirm-payment`).send({});
    assert.equal(prematureRes.status, 400);

    // Platform 3.0 Phase 17: listFlightBookings() was refactored to map
    // already-fetched rows in memory instead of re-querying each booking
    // individually (an N+1 fix) — this is the evidence the list endpoint's
    // output shape is unchanged by that refactor.
    const listRes = await admin.get("/api/flight-bookings/admin/list");
    assert.equal(listRes.status, 200);
    const listed = listRes.body.bookings.find((b) => b.id === booking.id);
    assert.ok(listed, "expected the created booking in the admin list");
    assert.equal(listed.status, "PAYMENT_CONFIRMED");
    assert.equal(listed.statusLabel, "تم تأكيد الدفع");
    assert.deepEqual(listed.flightIds, [flightId]);
    assert.equal(listed.customer_email, "flight@test.local");
    assert.equal(listed.customer_phone, phone);

    const filteredListRes = await admin.get("/api/flight-bookings/admin/list").query({ status: "PAYMENT_CONFIRMED" });
    assert.equal(filteredListRes.status, 200);
    assert.ok(filteredListRes.body.bookings.every((b) => b.status === "PAYMENT_CONFIRMED"));
    assert.ok(filteredListRes.body.bookings.some((b) => b.id === booking.id));

    const finalRes = await admin.post(`/api/flight-bookings/${booking.id}/final-ticket`).attach("file", Buffer.from("final ticket"), "final.txt");
    assert.equal(finalRes.status, 200);
    assert.equal(finalRes.body.booking.status, "FINAL_TICKET_ISSUED");

    const finalPublic = await request(app).get(`/api/flight-bookings/public/${booking.booking_number}`).query({ phone });
    assert.equal(finalPublic.status, 200);
    assert.equal(finalPublic.body.booking.status, "FINAL_TICKET_ISSUED");
    assert.ok(finalPublic.body.booking.final_ticket_path);
  });

  // Regression: createFlightBooking used to trust a client-supplied amount
  // outright, even for a flight with a known, staff-set price sitting in
  // flight_inventory — a customer could book a real flight for an
  // arbitrary self-reported amount.
  test("rejects a booking amount that doesn't match the manual flight's price", async () => {
    const res = await request(app).post("/api/flight-bookings").send({
      flightId,
      amount: 1,
      currency: "SDG",
      contact: { fullName: "Underpay Test", phone: `24997${uniqueSuffix().slice(-7)}` },
      passengers: [{ firstName: "UNDERPAY", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }],
    });
    assert.equal(res.status, 400);
  });

  test("rejects a booking referencing a flight id that isn't in inventory", async () => {
    const res = await request(app).post("/api/flight-bookings").send({
      flightId: "does-not-exist",
      amount: 1500000,
      currency: "SDG",
      contact: { fullName: "Bad Flight Test", phone: `24998${uniqueSuffix().slice(-7)}` },
      passengers: [{ firstName: "BADFLIGHT", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }],
    });
    assert.equal(res.status, 400);
  });

  // TRIP-sourced flights have no persisted quote to check against (a
  // separate, larger gap tracked in Issue #56), so a TRIP-prefixed id
  // deliberately still bypasses the price check this test file otherwise
  // exercises above.
  test("does not price-check a TRIP-sourced flight id", async () => {
    const res = await request(app).post("/api/flight-bookings").send({
      flightId: "TRIP:some-external-flight-ref",
      amount: 1,
      currency: "SDG",
      contact: { fullName: "Trip Source Test", phone: `24999${uniqueSuffix().slice(-7)}` },
      passengers: [{ firstName: "TRIPSOURCE", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }],
    });
    assert.equal(res.status, 201);
  });

  // Regression: POST /api/flight-bookings is unauthenticated, and used to
  // trust a client-supplied customerId outright — anyone who knew or
  // guessed an existing customer's id could attach a fabricated booking
  // (and its order) to that stranger's record with no ownership check.
  test("ignores a spoofed customerId whose phone doesn't match the request's contact phone", async () => {
    const targetPhone = `24994${uniqueSuffix().slice(-7)}`;
    const targetCustomer = await admin.post("/api/customers").send({ fullName: "Real Owner", passportNo: `P${uniqueSuffix()}`, nationality: "Sudan", phone: targetPhone });
    assert.equal(targetCustomer.status, 201);

    const spoofedPhone = `24995${uniqueSuffix().slice(-7)}`;
    const createRes = await request(app).post("/api/flight-bookings").send({
      flightId,
      amount: 1500000,
      currency: "SDG",
      customerId: targetCustomer.body.data.id,
      contact: { fullName: "Attacker", phone: spoofedPhone },
      passengers: [{ firstName: "ATTACKER", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }],
    });
    assert.equal(createRes.status, 201);

    const fetched = await admin.get(`/api/flight-bookings/${createRes.body.booking.id}`);
    assert.equal(fetched.status, 200);
    assert.notEqual(fetched.body.booking.customer_id, targetCustomer.body.data.id);
    assert.equal(fetched.body.booking.customer_phone, spoofedPhone);
  });

  test("reuses the customer record when customerId's phone matches the request's contact phone", async () => {
    const ownerPhone = `24996${uniqueSuffix().slice(-7)}`;
    const owner = await admin.post("/api/customers").send({ fullName: "Returning Customer", passportNo: `P${uniqueSuffix()}`, nationality: "Sudan", phone: ownerPhone });
    assert.equal(owner.status, 201);

    const createRes = await request(app).post("/api/flight-bookings").send({
      flightId,
      amount: 1500000,
      currency: "SDG",
      customerId: owner.body.data.id,
      contact: { fullName: "Returning Customer", phone: ownerPhone },
      passengers: [{ firstName: "RETURNING", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }],
    });
    assert.equal(createRes.status, 201);

    const fetched = await admin.get(`/api/flight-bookings/${createRes.body.booking.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.booking.customer_id, owner.body.data.id);
  });

  test("rejects payment receipt upload before provisional ticket", async () => {
    const testPhone = `24992${uniqueSuffix().slice(-7)}`;
    const createRes = await request(app).post("/api/flight-bookings").send({ flightId, amount: 1500000, currency: "SDG", contact: { fullName: "Early Receipt Test", phone: testPhone }, passengers: [{ firstName: "EARLY", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }] });
    assert.equal(createRes.status, 201);
    const res = await request(app).post(`/api/flight-bookings/${createRes.body.booking.booking_number}/payment-receipt`).field("phone", testPhone).attach("file", Buffer.from("receipt"), "receipt.txt");
    assert.equal(res.status, 400);
  });

  test("rejects public access with wrong phone", async () => {
    const res = await request(app).get(`/api/flight-bookings/public/${booking.booking_number}`).query({ phone: "249000000000" });
    assert.equal(res.status, 404);
  });

  describe("document download isolation", () => {
    let ownerPhone;
    let ownedBooking;

    before(async () => {
      ownerPhone = `24993${uniqueSuffix().slice(-7)}`;
      const createRes = await request(app).post("/api/flight-bookings").send({ flightId, amount: 1500000, currency: "SDG", contact: { fullName: "File Isolation Test", phone: ownerPhone }, passengers: [{ firstName: "FILE", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }] });
      ownedBooking = createRes.body.booking;
      const provisionalRes = await admin.post(`/api/flight-bookings/${ownedBooking.id}/provisional-ticket`).attach("file", Buffer.from("provisional ticket contents"), "provisional.txt");
      assert.equal(provisionalRes.status, 200);
    });

    // Regression: GET /:id/file/:kind used to hand back any booking's
    // documents to anyone who knew (or guessed) the booking id/number, with
    // no verification at all — a customer-document IDOR.
    test("rejects a document download without the booking's phone number", async () => {
      const res = await request(app).get(`/api/flight-bookings/${ownedBooking.id}/file/provisional`);
      assert.equal(res.status, 404);
    });

    test("rejects a document download with someone else's phone number", async () => {
      const res = await request(app).get(`/api/flight-bookings/${ownedBooking.id}/file/provisional`).query({ phone: "249111111111" });
      assert.equal(res.status, 404);
    });

    test("allows the document download with the matching phone number", async () => {
      const res = await request(app).get(`/api/flight-bookings/${ownedBooking.id}/file/provisional`).query({ phone: ownerPhone });
      assert.equal(res.status, 200);
      assert.equal(res.text, "provisional ticket contents");
    });

    // Regression: GET /:id used to return full booking details (name,
    // phone, amount, passengers) to anyone, unauthenticated.
    test("requires staff auth to fetch a booking by id directly", async () => {
      const res = await request(app).get(`/api/flight-bookings/${ownedBooking.id}`);
      assert.equal(res.status, 401);
    });

    test("staff can fetch a booking by id and download its files via the staff-only routes", async () => {
      const getRes = await admin.get(`/api/flight-bookings/${ownedBooking.id}`);
      assert.equal(getRes.status, 200);
      assert.equal(getRes.body.booking.id, ownedBooking.id);

      const fileRes = await admin.get(`/api/flight-bookings/${ownedBooking.id}/staff-file/provisional`);
      assert.equal(fileRes.status, 200);
    });

    test("EMPLOYEE cannot download staff files without authentication", async () => {
      const res = await request(app).get(`/api/flight-bookings/${ownedBooking.id}/staff-file/provisional`);
      assert.equal(res.status, 401);
    });
  });
});
