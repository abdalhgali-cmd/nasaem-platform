// Track A2 (AUDIT-00 G-27): the read-only review list of customers the old
// public flight booking may have linked by passport. Managers only, scoped
// to the organization, no passport numbers or phones, and it changes
// nothing. Synthetic data only.
import "./env.js";
import crypto from "node:crypto";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";

import prisma from "../src/config/database.js";
import { uniqueSuffix } from "./helpers/api.js";
import { createOrganization, createStaffUser, staffClient } from "./helpers/staff.js";

const ORG = "org_nasaem_default";
let admin;
let multi;
let generated;
let temp;
let single;
let foreign;

async function customer(organizationId, passportNo) {
  return prisma.customer.create({ data: { organizationId, customerNo: `REV-${uniqueSuffix()}`, fullName: `Review ${uniqueSuffix()}`, passportNo, phone: "+249900000123", nationality: "SD" } });
}
async function legacyBooking(c) {
  const order = await prisma.order.create({ data: { organizationId: c.organizationId, orderNumber: `ORD-REV-${uniqueSuffix()}`, customerId: c.id, status: "NEW", totalAmount: 100, currency: "SDG" } });
  const number = `FLT-REV-${uniqueSuffix()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO flight_bookings (id,booking_number,order_id,customer_id,flight_id,status,passengers,amount,currency,created_at,updated_at) VALUES ($1,$2,$3,$4,'[]','REQUESTED','[]'::jsonb,100,'SDG',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    crypto.randomUUID(), number, order.id, c.id
  );
  return number;
}

before(async () => {
  admin = await createStaffUser({ role: "ADMIN" });
  multi = await customer(ORG, `MULTI${uniqueSuffix()}`);
  await legacyBooking(multi);
  await legacyBooking(multi);
  generated = await customer(ORG, `GEN${uniqueSuffix()}-1729000000000`);
  await legacyBooking(generated);
  temp = await customer(ORG, `TEMP-${Date.now()}${uniqueSuffix().slice(-3)}`);
  single = await customer(ORG, `ONE${uniqueSuffix()}`);
  await legacyBooking(single);
  const other = await createOrganization();
  foreign = await customer(other.id, `FOREIGN${uniqueSuffix()}-1729000000000`);
  await legacyBooking(foreign);
  await legacyBooking(foreign);
});

describe("auto-link review list", () => {
  test("lists both signals with reasons; nothing else; no passport numbers or phones", async () => {
    const res = await staffClient(admin).get("/api/customers/review/auto-links");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const byId = new Map(res.body.data.map((item) => [item.customerId, item]));
    assert.deepEqual(byId.get(multi.id).reasons, ["MULTIPLE_PUBLIC_BOOKINGS"]);
    assert.equal(byId.get(multi.id).bookingCount, 2);
    assert.deepEqual(byId.get(generated.id).reasons, ["GENERATED_PASSPORT"]);
    assert.deepEqual(byId.get(temp.id).reasons, ["GENERATED_PASSPORT"]);
    assert.equal(byId.get(temp.id).bookingCount, 0);
    assert.equal(byId.has(single.id), false, "one booking and a real passport: not listed");
    assert.equal(byId.has(foreign.id), false, "another organization's customer is never listed");
    const body = JSON.stringify(res.body);
    for (const c of [multi, generated, temp]) assert.ok(!body.includes(c.passportNo), "no passport number");
    assert.ok(!body.includes("+249900000123"), "no phone");
  });

  test("managers only", async () => {
    for (const role of ["EMPLOYEE", "ACCOUNTANT", "CONTENT_MANAGER"]) {
      const res = await staffClient(await createStaffUser({ role })).get("/api/customers/review/auto-links");
      assert.equal(res.status, 403, role);
    }
    assert.equal((await staffClient(await createStaffUser({ role: "SUPER_ADMIN" })).get("/api/customers/review/auto-links")).status, 200);
  });

  test("read only: no customer or booking changes", async () => {
    const before = await prisma.customer.findUnique({ where: { id: multi.id } });
    const bookingsBefore = await prisma.$queryRawUnsafe(`SELECT id, customer_id, updated_at FROM flight_bookings WHERE customer_id=$1 ORDER BY id`, multi.id);
    await staffClient(admin).get("/api/customers/review/auto-links");
    assert.deepEqual(await prisma.customer.findUnique({ where: { id: multi.id } }), before);
    assert.deepEqual(await prisma.$queryRawUnsafe(`SELECT id, customer_id, updated_at FROM flight_bookings WHERE customer_id=$1 ORDER BY id`, multi.id), bookingsBefore);
  });
});
