import "./env.js";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { app, loginAsSuperAdmin, request, uniqueSuffix } from "./helpers/api.js";
import prisma from "../src/config/database.js";
import { UPLOAD_ROOT, resolveUploadPath } from "../src/config/uploadRoot.js";
import { getBookingFile } from "../src/modules/flight-bookings/flight-bookings.service.js";

// Phase 1 (storage): flight booking files (provisional tickets, payment
// receipts, final tickets) used to bypass the shared UPLOAD_ROOT via a
// standalone UPLOAD_DIR/env var. These tests cover the persistent-storage
// contract now shared with every other upload module — see
// upload-validation.test.js for the generic resolveStoredUploadPath
// coverage this complements with flight-booking-specific scenarios.
describe("flight booking file storage (persistent UPLOAD_ROOT)", () => {
  let admin;
  let flightId;

  before(async () => {
    admin = await loginAsSuperAdmin();
    const flightRes = await admin.post("/api/flights").send({
      airline: "TARCO",
      flightNumber: `3S${uniqueSuffix().slice(-4)}`,
      originCode: "PZU",
      originName: "Port Sudan",
      destinationCode: "JED",
      destinationName: "Jeddah",
      departureAt: "2026-10-01T08:30:00+02:00",
      arrivalAt: "2026-10-01T11:30:00+02:00",
      stops: 0,
      baggage: "30 KG",
      cabin: "Economy",
      price: 1500000,
      currency: "SDG",
      availableSeats: 10,
    });
    assert.equal(flightRes.status, 201);
    flightId = flightRes.body.data.id;
  });

  async function createBooking(phone) {
    const res = await request(app).post("/api/flight-bookings").send({
      flightId,
      amount: 1500000,
      currency: "SDG",
      contact: { fullName: "Storage Test", phone },
      passengers: [{ firstName: "STORAGE", lastName: "TEST", nationality: "Sudan", passportNo: `P${uniqueSuffix()}` }],
    });
    assert.equal(res.status, 201);
    return res.body.booking;
  }

  test("provisional ticket is written under UPLOAD_ROOT/flight-bookings and stored relative to UPLOAD_ROOT", async () => {
    const phone = `24994${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);

    const uploadRes = await admin
      .post(`/api/flight-bookings/${booking.id}/provisional-ticket`)
      .attach("file", Buffer.from("provisional contents"), "provisional.txt");
    assert.equal(uploadRes.status, 200);

    const row = (
      await prisma.$queryRawUnsafe(`SELECT provisional_ticket_path FROM flight_bookings WHERE id=$1`, booking.id)
    )[0];
    assert.ok(row.provisional_ticket_path.startsWith("flight-bookings/"));
    assert.ok(!path.isAbsolute(row.provisional_ticket_path));

    const onDisk = path.join(UPLOAD_ROOT, row.provisional_ticket_path);
    assert.equal(await fs.readFile(onDisk, "utf8"), "provisional contents");
  });

  test("payment receipt and final ticket also resolve through the staff-file route after the new writes", async () => {
    const phone = `24995${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);

    await admin.post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", Buffer.from("p"), "p.txt");
    const receiptRes = await request(app)
      .post(`/api/flight-bookings/${booking.booking_number}/payment-receipt`)
      .field("phone", phone)
      .attach("file", Buffer.from("receipt contents"), "receipt.txt");
    assert.equal(receiptRes.status, 200);

    await admin.post(`/api/flight-bookings/${booking.id}/confirm-payment`).send({});
    const finalRes = await admin
      .post(`/api/flight-bookings/${booking.id}/final-ticket`)
      .attach("file", Buffer.from("final contents"), "final.txt");
    assert.equal(finalRes.status, 200);

    const receiptFile = await admin.get(`/api/flight-bookings/${booking.id}/staff-file/receipt`);
    assert.equal(receiptFile.status, 200);
    assert.equal(receiptFile.text, "receipt contents");

    const finalFile = await admin.get(`/api/flight-bookings/${booking.id}/staff-file/final`);
    assert.equal(finalFile.status, 200);
    assert.equal(finalFile.text, "final contents");
  });

  test("reads a historical uploads/flight-bookings/... relative path (pre-fix rows) onto the current UPLOAD_ROOT", async () => {
    const phone = `24996${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);

    const legacyDir = resolveUploadPath("flight-bookings", booking.booking_number);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, "legacy-provisional.txt"), "legacy provisional contents");

    // Pre-fix rows stored `path.relative(process.cwd(), fullPath)` against a
    // default UPLOAD_DIR of `<cwd>/uploads/flight-bookings/...` — reproduced
    // here as the literal legacy string shape, independent of this
    // sandbox's actual cwd.
    const legacyStoredPath = path.posix.join(
      "uploads",
      "flight-bookings",
      booking.booking_number,
      "legacy-provisional.txt"
    );
    await prisma.$executeRawUnsafe(
      `UPDATE flight_bookings SET provisional_ticket_path=$2, provisional_ticket_name=$3 WHERE id=$1`,
      booking.id,
      legacyStoredPath,
      "legacy-provisional.txt"
    );

    const file = await getBookingFile(booking.id, "provisional", { organizationId: undefined });
    assert.equal(await fs.readFile(file.path, "utf8"), "legacy provisional contents");
  });

  test("rejects a traversal payload stored in a booking's file path", async () => {
    const phone = `24997${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);

    await prisma.$executeRawUnsafe(
      `UPDATE flight_bookings SET provisional_ticket_path=$2, provisional_ticket_name=$3 WHERE id=$1`,
      booking.id,
      "../../../../etc/passwd",
      "passwd"
    );

    await assert.rejects(
      () => getBookingFile(booking.id, "provisional", { organizationId: undefined }),
      /outside UPLOAD_ROOT/
    );
  });

  test("the download route rejects a traversal payload rather than serving a file", async () => {
    const phone = `24998${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);

    await prisma.$executeRawUnsafe(
      `UPDATE flight_bookings SET provisional_ticket_path=$2, provisional_ticket_name=$3 WHERE id=$1`,
      booking.id,
      "../../../../etc/passwd",
      "passwd"
    );

    const res = await request(app)
      .get(`/api/flight-bookings/${booking.id}/file/provisional`)
      .query({ phone });
    assert.ok(res.status >= 400);
    assert.notEqual(res.status, 200);
  });

  test("missing file behavior: a booking with no uploaded document yet returns an error, not a crash", async () => {
    const phone = `24999${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);

    await assert.rejects(() => getBookingFile(booking.id, "provisional", { organizationId: undefined }), /not available/);

    const res = await request(app).get(`/api/flight-bookings/${booking.id}/file/provisional`).query({ phone });
    assert.ok(res.status >= 400);
  });

  test("path resolution is stable across repeated resolution (equivalent to surviving a process restart)", async () => {
    const phone = `24981${uniqueSuffix().slice(-7)}`;
    const booking = await createBooking(phone);
    await admin.post(`/api/flight-bookings/${booking.id}/provisional-ticket`).attach("file", Buffer.from("stable"), "s.txt");

    const first = await getBookingFile(booking.id, "provisional", { organizationId: undefined });
    const second = await getBookingFile(booking.id, "provisional", { organizationId: undefined });
    assert.equal(first.path, second.path);
    assert.equal(first.path, resolveUploadPath(first.path.slice(UPLOAD_ROOT.length + 1)));
  });
});
