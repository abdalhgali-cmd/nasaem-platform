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

    const finalRes = await admin.post(`/api/flight-bookings/${booking.id}/final-ticket`).attach("file", Buffer.from("final ticket"), "final.txt");
    assert.equal(finalRes.status, 200);
    assert.equal(finalRes.body.booking.status, "FINAL_TICKET_ISSUED");

    const finalPublic = await request(app).get(`/api/flight-bookings/public/${booking.booking_number}`).query({ phone });
    assert.equal(finalPublic.status, 200);
    assert.equal(finalPublic.body.booking.status, "FINAL_TICKET_ISSUED");
    assert.ok(finalPublic.body.booking.final_ticket_path);
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
});
