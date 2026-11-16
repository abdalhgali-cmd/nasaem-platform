import "./env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import prisma from "../src/config/database.js";
import { loginAsSuperAdmin, uniqueSuffix } from "./helpers/api.js";

function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Flights");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

function row(flightNumber) {
  return { airline: "TEST EXCEL", flight_number: flightNumber, origin_code: "PZU", origin: "Port Sudan", destination_code: "JED", destination: "Jeddah", departure_at: "2030-02-10T08:00:00Z", arrival_at: "2030-02-10T11:00:00Z", price: 123, currency: "USD" };
}

test("patched Excel reader imports a valid flight through the authenticated API", async () => {
  const admin = await loginAsSuperAdmin();
  const number = `TEST-EXCEL-${uniqueSuffix()}`;
  try {
    const res = await admin.post("/api/flights/import").attach("file", workbook([row(number)]), { filename: "test.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.imported, 1); assert.equal(res.body.data.failed, 0);
    const rows = await prisma.$queryRaw`SELECT price, currency FROM flight_inventory WHERE flight_number = ${number}`;
    assert.equal(rows.length, 1); assert.equal(Number(rows[0].price), 123); assert.equal(rows[0].currency, "USD");
  } finally {
    await prisma.$executeRaw`DELETE FROM flight_inventory WHERE flight_number = ${number}`;
  }
});

test("an oversized Excel import is rejected before inserting even its first row", async () => {
  const admin = await loginAsSuperAdmin();
  const number = `TEST-EXCEL-LIMIT-${uniqueSuffix()}`;
  const res = await admin.post("/api/flights/import").attach("file", workbook(Array.from({ length: 1001 }, () => row(number))), { filename: "too-many.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /1000/);
  const [{ count }] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM flight_inventory WHERE flight_number = ${number}`;
  assert.equal(count, 0);
});

test("a broken workbook returns an input error without exposing parser internals", async () => {
  const admin = await loginAsSuperAdmin();
  const res = await admin.post("/api/flights/import").attach("file", Buffer.from("PK\x03\x04broken-archive"), { filename: "broken.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /تعذّر قراءة ملف Excel/);
  assert.equal(res.body.stack, undefined);
});
