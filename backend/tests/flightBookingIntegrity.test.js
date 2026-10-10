import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";

const pdf = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);
const asText = (res, cb) => { let data = ""; res.setEncoding("utf8"); res.on("data", (c) => { data += c; }); res.on("end", () => cb(null, data)); };

let admin;
let employee;
let accountant;
let flightId;
const PRICE = 750000;

before(async () => {
  admin = await createStaffUser({ role: "ADMIN" });
  employee = await createStaffUser({ role: "EMPLOYEE" });
  accountant = await createStaffUser({ role: "ACCOUNTANT" });
  const flight = await staffClient(admin).post("/api/flights").send({
    airline: "SynthAir", flightNumber: `SY${uniqueSuffix().slice(-4)}`, originCode: "PZU", originName: "Port Sudan",
    destinationCode: "JED", destinationName: "Jeddah", departureAt: "2027-01-10T08:00:00+02:00", arrivalAt: "2027-01-10T10:00:00+02:00",
    price: PRICE, currency: "SDG", availableSeats: 9,
  });
  assert.equal(flight.status, 201);
  flightId = flight.body.data.id;
  await staffClient(admin).post("/api/flight-bookings/admin/bank-accounts").send({ key: `integ-${uniqueSuffix()}`, label: "Synthetic bank", accountNumber: "0001", active: true });
});

function book(overrides = {}) {
  const phone = `2499${uniqueSuffix().slice(-8)}`;
  return request(app).post("/api/flight-bookings").send({
    flightId,
    currency: "SDG",
    contact: { fullName: "Synthetic Traveler", phone },
    passengers: [{ firstName: "SYN", lastName: "TRAVELER", nationality: "SD", passportNo: `SP${uniqueSuffix()}` }],
    ...overrides,
  }).then((res) => ({ res, phone }));
}

describe("flight booking price and ownership come from the server", () => {
  test("a tampered amount is refused; without an amount the server prices the booking", async () => {
    const { res: tampered } = await book({ amount: 1 });
    assert.equal(tampered.status, 409);
    assert.equal(tampered.body.code, "PRICE_CHANGED");

    const { res } = await book();
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.booking.amount), PRICE);
  });

  test("a client-supplied customerId is ignored and internal paths are not returned", async () => {
    const victim = await prisma.customer.create({ data: { customerNo: `V-${uniqueSuffix()}`, fullName: "Someone else", phone: "+249000000000" } });
    const { res } = await book({ customerId: victim.id });
    assert.equal(res.status, 201);
    const row = (await prisma.$queryRawUnsafe(`SELECT customer_id FROM flight_bookings WHERE id=$1`, res.body.booking.id))[0];
    assert.notEqual(row.customer_id, victim.id);
    assert.equal(res.body.booking.order_id, undefined);
    assert.equal(res.body.booking.customer_id, undefined);
  });
});

describe("flight booking lifecycle", () => {
  test("request -> provisional -> receipt -> confirmation (once) -> final ticket -> customer access", async () => {
    const { res, phone } = await book();
    const booking = res.body.booking;

    // Not a real document: refused by its bytes, booking unchanged.
    const bad = await staffClient(employee).post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", Buffer.from("<html>not a ticket</html>"), "ticket.pdf");
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, "UNSUPPORTED_FILE_TYPE");

    // ACCOUNTANT cannot upload tickets; EMPLOYEE can.
    assert.equal((await staffClient(accountant).post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", pdf("p"), "p.pdf")).status, 403);
    assert.equal((await staffClient(employee).post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", pdf("provisional"), "p.pdf")).status, 200);

    const receipt = await request(app).post(`/api/flight-bookings/${booking.booking_number}/payment-receipt`).field("phone", phone).attach("file", pdf("receipt"), "r.pdf");
    assert.equal(receipt.status, 200);
    assert.equal(receipt.body.booking.status, "PAYMENT_UNDER_REVIEW");
    assert.equal(receipt.body.booking.payment_receipt_path, true, "customer view exposes only that a receipt exists");

    // EMPLOYEE cannot confirm money; three concurrent ACCOUNTANT confirmations record one payment.
    assert.equal((await staffClient(employee).post(`/api/flight-bookings/${booking.id}/confirm-payment`).send({})).status, 403);
    const confirms = await Promise.all([1, 2, 3].map(() => staffClient(accountant).post(`/api/flight-bookings/${booking.id}/confirm-payment`).send({ note: "تم التحقق من التحويل" })));
    assert.equal(confirms.filter((r) => r.status === 200).length, 1, confirms.map((r) => r.status).join(","));
    const orderRow = (await prisma.$queryRawUnsafe(`SELECT order_id FROM flight_bookings WHERE id=$1`, booking.id))[0];
    const payments = await prisma.payment.findMany({ where: { orderId: orderRow.order_id } });
    assert.equal(payments.length, 1);
    assert.equal(payments[0].currency, "SDG");
    assert.equal(Number(payments[0].amount), PRICE);
    assert.equal(payments[0].createdByUserId, accountant.id);
    assert.equal((await prisma.order.findUnique({ where: { id: orderRow.order_id } })).paymentStatus, "PAID");

    assert.equal((await staffClient(employee).post(`/api/flight-bookings/${booking.id}/final-ticket`).attach("file", pdf("final"), "f.pdf")).status, 200);
    // A second final ticket cannot replace the first.
    assert.equal((await staffClient(employee).post(`/api/flight-bookings/${booking.id}/final-ticket`).attach("file", pdf("other"), "f2.pdf")).status, 400);

    const customerFile = await request(app).get(`/api/flight-bookings/${booking.booking_number}/file/final`).query({ phone }).buffer(true).parse(asText);
    assert.equal(customerFile.status, 200);
    assert.equal(customerFile.body, pdf("final").toString());
    assert.equal((await request(app).get(`/api/flight-bookings/${booking.booking_number}/file/final`).query({ phone: "249111111111" })).status, 404);
  });

  test("another organization's staff cannot see or act on the booking", async () => {
    const other = await createOrganization("flight-other");
    const otherAdmin = await createStaffUser({ role: "ADMIN", organizationId: other.id });
    const { res } = await book();
    const id = res.body.booking.id;
    const client = staffClient(otherAdmin);
    assert.equal((await client.get(`/api/flight-bookings/${id}`)).status, 404);
    assert.equal((await client.post(`/api/flight-bookings/${id}/provisional-ticket`).attach("file", pdf("x"), "x.pdf")).status, 404);
    assert.equal((await client.get(`/api/flight-bookings/${id}/staff-file/provisional`)).status, 404);
    const list = await client.get("/api/flight-bookings/admin/list");
    assert.ok(list.body.bookings.every((b) => b.id !== id));
  });

  test("staff search finds a booking by number or phone", async () => {
    const { res, phone } = await book();
    const client = staffClient(employee);
    const byNumber = await client.get(`/api/flight-bookings/admin/list?search=${encodeURIComponent(res.body.booking.booking_number)}`);
    assert.deepEqual(byNumber.body.bookings.map((b) => b.id), [res.body.booking.id]);
    const byPhone = await client.get(`/api/flight-bookings/admin/list?search=${encodeURIComponent(phone.slice(-6))}`);
    assert.ok(byPhone.body.bookings.some((b) => b.id === res.body.booking.id));
  });
});
