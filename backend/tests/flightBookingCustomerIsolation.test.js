// AUDIT-00 G-27 / Track A1: a public flight booking is never linked to an
// existing customer by passport or phone, and passport numbers never appear
// in lists (only inside a booking's or a customer's details). Synthetic data
// only.
import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";
import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createStaffUser, staffClient } from "./helpers/staff.js";

let admin;
let employee;
let flightId;

before(async () => {
  admin = await createStaffUser({ role: "ADMIN" });
  employee = await createStaffUser({ role: "EMPLOYEE" });
  const flight = await staffClient(admin).post("/api/flights").send({
    airline: "SynthAir", flightNumber: `SY${uniqueSuffix().slice(-4)}`, originCode: "PZU", originName: "Port Sudan",
    destinationCode: "JED", destinationName: "Jeddah", departureAt: "2027-03-10T08:00:00+02:00", arrivalAt: "2027-03-10T10:00:00+02:00",
    price: 500000, currency: "SDG", availableSeats: 9,
  });
  assert.equal(flight.status, 201);
  flightId = flight.body.data.id;
});

const phone = () => `2499${uniqueSuffix().slice(-8)}`;
function book({ passportNo, contactPhone = phone(), fullName = "Synthetic Booker" }) {
  return request(app).post("/api/flight-bookings").send({
    flightId,
    currency: "SDG",
    contact: { fullName, phone: contactPhone },
    passengers: [{ firstName: "SYN", lastName: "PAX", nationality: "SD", birthDate: "1990-01-01", passportNo }],
  });
}
const customerOf = async (bookingId) => (await prisma.$queryRawUnsafe(`SELECT customer_id FROM flight_bookings WHERE id=$1`, bookingId))[0].customer_id;

describe("public flight bookings are never linked to an existing customer", () => {
  test("same passport, different phones: two separate customers; neither booker sees the other's booking", async () => {
    const passportNo = `SP${uniqueSuffix()}`;
    const [phoneA, phoneB] = [phone(), phone()];
    const first = await book({ passportNo, contactPhone: phoneA });
    const second = await book({ passportNo, contactPhone: phoneB });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.notEqual(await customerOf(first.body.booking.id), await customerOf(second.body.booking.id));
    const other = await request(app).get(`/api/flight-bookings/public/${first.body.booking.booking_number}`).query({ phone: phoneB });
    assert.equal(other.status, 404, "the second booker cannot open the first booking");
    const own = await request(app).get(`/api/flight-bookings/public/${first.body.booking.booking_number}`).query({ phone: phoneA });
    assert.equal(own.status, 200);
  });

  test("same phone twice: still two customer records (no inference from the phone)", async () => {
    const contactPhone = phone();
    const first = await book({ passportNo: `SP${uniqueSuffix()}`, contactPhone });
    const second = await book({ passportNo: `SP${uniqueSuffix()}`, contactPhone });
    assert.notEqual(await customerOf(first.body.booking.id), await customerOf(second.body.booking.id));
  });

  test("an existing staff-created customer with the same passport is untouched; no invented passport is stored", async () => {
    const passportNo = `CRM${uniqueSuffix()}`;
    const crm = await prisma.customer.create({ data: { customerNo: `CRM-${uniqueSuffix()}`, fullName: "Existing CRM Customer", passportNo, phone: "+249000000001", nationality: "SD" } });
    const res = await book({ passportNo });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const customerId = await customerOf(res.body.booking.id);
    assert.notEqual(customerId, crm.id);
    const created = await prisma.customer.findUnique({ where: { id: customerId } });
    assert.equal(created.passportNo, null, "no customer passport and no TEMP-/timestamp value");
    assert.equal(await prisma.order.count({ where: { customerId: crm.id } }), 0, "nothing attached to the CRM record");
  });
});

describe("a logged-in customer books under their own account (verified session only)", () => {
  test("with a valid session the booking is the account's and shows in the account's orders", async () => {
    const accountPhone = `249${uniqueSuffix().slice(-9)}`;
    const reg = await request(app).post("/api/customer-auth/register").send({ fullName: "Account Holder", phone: accountPhone, password: "Test@12345" });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const token = reg.body.data.token;
    const res = await request(app).post("/api/flight-bookings").set("Authorization", `Bearer ${token}`).send({
      flightId, currency: "SDG", contact: { fullName: "Account Holder", phone: accountPhone },
      passengers: [{ firstName: "SYN", lastName: "PAX", nationality: "SD", birthDate: "1990-01-01", passportNo: `ACC${uniqueSuffix()}` }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(await customerOf(res.body.booking.id), reg.body.data.customer.id);
    const orders = await request(app).get("/api/customer/orders").set("Authorization", `Bearer ${token}`);
    assert.equal(orders.status, 200);
    const orderId = (await prisma.$queryRawUnsafe(`SELECT order_id FROM flight_bookings WHERE id=$1`, res.body.booking.id))[0].order_id;
    assert.ok(JSON.stringify(orders.body).includes(orderId), "the booking's order is in the account");
  });

  test("a session booking with a different contact phone is a separate record the entered phone can follow up", async () => {
    const accountPhone = `249${uniqueSuffix().slice(-9)}`;
    const reg = await request(app).post("/api/customer-auth/register").send({ fullName: "Other Phone Holder", phone: accountPhone, password: "Test@12345" });
    assert.equal(reg.status, 201, JSON.stringify(reg.body));
    const contactPhone = phone();
    const res = await request(app).post("/api/flight-bookings").set("Authorization", `Bearer ${reg.body.data.token}`).send({
      flightId, currency: "SDG", contact: { fullName: "Other Phone Holder", phone: contactPhone },
      passengers: [{ firstName: "SYN", lastName: "PAX", nationality: "SD", birthDate: "1990-01-01", passportNo: `DIF${uniqueSuffix()}` }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.notEqual(await customerOf(res.body.booking.id), reg.body.data.customer.id);
    const follow = await request(app).get(`/api/flight-bookings/public/${res.body.booking.booking_number}`).query({ phone: contactPhone });
    assert.equal(follow.status, 200, "the phone the booker entered opens the booking");
  });

  test("an invalid or forged session is ignored: a separate record, never someone else's", async () => {
    const res = await request(app).post("/api/flight-bookings").set("Authorization", "Bearer not.a.jwt").send({
      flightId, currency: "SDG", contact: { fullName: "Anon", phone: phone() },
      passengers: [{ firstName: "SYN", lastName: "PAX", nationality: "SD", birthDate: "1990-01-01", passportNo: `FRG${uniqueSuffix()}` }],
      customerId: "someone-else",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const created = await prisma.customer.findUnique({ where: { id: await customerOf(res.body.booking.id) } });
    assert.equal(created.passwordHash, null, "a new, non-account record");
  });
});

describe("passport numbers are hidden in lists and shown in details to staff", () => {
  test("staff booking list: passengers without passport numbers; the booking detail shows them", async () => {
    const passportNo = `LST${uniqueSuffix()}`;
    const res = await book({ passportNo });
    const list = await staffClient(employee).get("/api/flight-bookings/admin/list");
    assert.equal(list.status, 200);
    const row = list.body.bookings.find((b) => b.id === res.body.booking.id);
    assert.ok(row);
    assert.equal(row.passengers.length, 1);
    assert.equal(row.passengers[0].passportNo, undefined);
    assert.ok(!JSON.stringify(list.body).includes(passportNo), "the number appears nowhere in the list response");
    const detail = await staffClient(employee).get(`/api/flight-bookings/${res.body.booking.id}`);
    assert.equal(detail.body.booking.passengers[0].passportNo, passportNo);
  });

  test("orders and payments lists mask the passport; the order's page shows it", async () => {
    const passportNo = `ORDLIST${uniqueSuffix()}`;
    const customer = await prisma.customer.create({ data: { organizationId: admin.organizationId, customerNo: `OL-${uniqueSuffix()}`, fullName: "List Customer", passportNo, nationality: "SD" } });
    const order = await prisma.order.create({ data: { organizationId: admin.organizationId, orderNumber: `ORD-OL-${uniqueSuffix()}`, customerId: customer.id, status: "NEW", totalAmount: 100, currency: "SDG" } });
    await prisma.payment.create({ data: { orderId: order.id, amount: 50, currency: "SDG", paymentMethod: "BANK_TRANSFER" } });
    const orders = await staffClient(admin).get(`/api/orders?search=${order.orderNumber}`);
    assert.equal(orders.status, 200);
    assert.equal(orders.body.data[0].customer.passportNo, `•••${passportNo.slice(-3)}`);
    const payments = await staffClient(admin).get(`/api/payments?orderId=${order.id}`);
    assert.equal(payments.status, 200);
    assert.ok(payments.body.data.length >= 1);
    assert.ok(!JSON.stringify(payments.body).includes(passportNo));
    const detail = await staffClient(admin).get(`/api/orders/${order.id}`);
    assert.ok(JSON.stringify(detail.body).includes(passportNo), "the order's own page shows it");
  });

  test("operations queue carries no passport numbers", async () => {
    const passportNo = `OPS${uniqueSuffix()}`;
    const customer = await prisma.customer.create({ data: { organizationId: admin.organizationId, customerNo: `OPS-${uniqueSuffix()}`, fullName: "Ops Customer", passportNo, nationality: "SD" } });
    const order = await prisma.order.create({ data: { organizationId: admin.organizationId, orderNumber: `ORD-OPS-${uniqueSuffix()}`, customerId: customer.id, status: "NEW", totalAmount: 100, currency: "SDG", updatedAt: new Date("2000-01-01T00:00:00Z") } });
    // The queue lists the 50 oldest open orders; this one is dated first.
    const ops = await staffClient(admin).get("/api/dashboard/operations");
    assert.equal(ops.status, 200);
    assert.ok(JSON.stringify(ops.body).includes(order.orderNumber), "the order is in the queue");
    assert.ok(!JSON.stringify(ops.body).includes(passportNo));
  });
});
